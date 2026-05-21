(function () {
  const tauriInvoke = window.__TAURI__?.core?.invoke;

  const fallbackSettings = {
    client_id: "",
    client_secret: "",
    proxy: "",
  };

  function invoke(command, args) {
    if (!tauriInvoke) {
      if (command === "cal_load_settings") return Promise.resolve(fallbackSettings);
      if (command === "cal_save_settings") return Promise.resolve();
      if (command === "cal_get_auth_status") return Promise.resolve({ authenticated: false, email: null });
      if (command === "cal_list_calendars") return Promise.resolve(sampleCalendars());
      if (command === "cal_get_events") return Promise.resolve(sampleEvents(args?.calendarId));
      if (command === "cal_list_task_lists") return Promise.resolve(sampleTaskLists());
      if (command === "cal_get_tasks") return Promise.resolve(sampleTasks(args?.taskListId));
      return Promise.reject(new Error("Tauri bridge is unavailable"));
    }
    return tauriInvoke(command, args);
  }

  function camelSettings(settings) {
    return {
      clientId: settings?.client_id || settings?.clientId || "",
      clientSecret: settings?.client_secret || settings?.clientSecret || "",
      proxy: settings?.proxy || "",
    };
  }

  function snakeSettings(settings) {
    return {
      client_id: settings?.clientId || settings?.client_id || "",
      client_secret: settings?.clientSecret || settings?.client_secret || "",
      proxy: settings?.proxy || "",
    };
  }

  function parseDate(value) {
    if (!value) return null;
    return new Date(value);
  }

  function transformCalendar(c) {
    return {
      raw: c,
      id: c.id,
      summary: c.summary || "Calendar",
      backgroundColor: c.background_color || c.backgroundColor || "#1a73e8",
      foregroundColor: c.foreground_color || c.foregroundColor || "#fff",
      selected: c.selected !== false,
      primary: !!c.primary,
    };
  }

  function transformEvent(e) {
    const startRaw = e.start?.date_time || e.start?.dateTime || e.start?.date;
    const endRaw = e.end?.date_time || e.end?.dateTime || e.end?.date;
    const isAllDay = !!(e.is_all_day || e.isAllDay || e.start?.date);
    return {
      raw: e,
      type: "event",
      id: e.id,
      calendarId: e.calendar_id || e.calendarId,
      summary: e.summary || "(无标题)",
      description: e.description || "",
      start: parseDate(startRaw),
      end: parseDate(endRaw),
      startRaw,
      endRaw,
      calendarColor: e.calendar_color || e.calendarColor || "#1a73e8",
      isAllDay,
    };
  }

  function transformTaskList(l) {
    return {
      raw: l,
      id: l.id,
      title: l.title || "Tasks",
    };
  }

  function transformTask(t) {
    return {
      raw: t,
      type: "task",
      id: t.id,
      taskListId: t.task_list_id || t.taskListId,
      title: t.title || "(无标题任务)",
      notes: t.notes || "",
      due: t.due ? new Date(t.due) : null,
      dueRaw: t.due || null,
      status: t.status || "needsAction",
      position: t.position || "",
      isAllDay: !!t.due,
    };
  }

  function sampleCalendars() {
    return [
      { id: "primary", summary: "Primary", background_color: "#1a73e8", selected: true, primary: true },
      { id: "work", summary: "Work", background_color: "#0b8043", selected: true, primary: false },
    ];
  }

  function sampleEvents(calendarId) {
    const now = new Date();
    const start = new Date(now);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 75);
    return [
      {
        id: `sample-${calendarId || "primary"}`,
        calendar_id: calendarId || "primary",
        summary: "浏览器预览事件",
        start: { date_time: start.toISOString() },
        end: { date_time: end.toISOString() },
        calendar_color: calendarId === "work" ? "#0b8043" : "#1a73e8",
      },
    ];
  }

  function sampleTaskLists() {
    return [{ id: "tasks", title: "My Tasks" }];
  }

  function sampleTasks(taskListId) {
    const due = new Date();
    due.setHours(0, 0, 0, 0);
    return [
      { id: "sample-task", task_list_id: taskListId || "tasks", title: "连接 Google Tasks", due: due.toISOString(), status: "needsAction" },
    ];
  }

  window.Bridge = {
    loadSettings: async () => camelSettings(await invoke("cal_load_settings")),
    saveSettings: (settings) => invoke("cal_save_settings", { settings: snakeSettings(settings) }),
    startOAuth: () => invoke("cal_start_oauth"),
    getAuthStatus: () => invoke("cal_get_auth_status"),
    logout: () => invoke("cal_logout"),
    listCalendars: async () => (await invoke("cal_list_calendars")).map(transformCalendar),
    getEvents: async (calendarId, timeMin, timeMax, calendarColor) => {
      const events = await invoke("cal_get_events", {
        calendarId,
        timeMin,
        timeMax,
        calendarColor,
      });
      return events.map(transformEvent);
    },
    createEvent: async (input) => transformEvent(await invoke("cal_create_event", {
      input: {
        calendar_id: input.calendarId,
        summary: input.summary,
        description: input.description || null,
        start: input.start,
        end: input.end,
        all_day: !!input.allDay,
      },
    })),
    deleteEvent: (calendarId, eventId) => invoke("cal_delete_event", { calendarId, eventId }),
    listTaskLists: async () => (await invoke("cal_list_task_lists")).map(transformTaskList),
    getTasks: async (taskListId) => (await invoke("cal_get_tasks", { taskListId })).map(transformTask),
    createTask: async (input) => transformTask(await invoke("cal_create_task", {
      input: {
        task_list_id: input.taskListId,
        title: input.title,
        notes: input.notes || null,
        due: input.due || null,
      },
    })),
    updateTask: async (update) => transformTask(await invoke("cal_update_task", {
      update: {
        task_list_id: update.taskListId,
        task_id: update.taskId,
        title: update.title ?? null,
        notes: update.notes ?? null,
        due: update.due ?? null,
        status: update.status ?? null,
      },
    })),
    deleteTask: (taskListId, taskId) => invoke("cal_delete_task", { taskListId, taskId }),
  };
})();
