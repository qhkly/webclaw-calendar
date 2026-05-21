const { useCallback, useEffect, useMemo, useState } = React;

function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function rfc3339(date) {
  return date.toISOString();
}

function SettingsPage({ settings, onSave, onBack, error }) {
  const [form, setForm] = useState(settings);
  useEffect(() => setForm(settings), [settings.clientId, settings.clientSecret, settings.proxy]);

  return (
    <div className="center-page">
      <section className="settings-shell">
        <div className="settings-copy">
          <div className="eyebrow">Google OAuth</div>
          <h1>连接 Google Calendar 和 Tasks</h1>
          <p>创建一个桌面应用 OAuth 客户端，启用 Calendar API 与 Tasks API，然后把 Client ID 和 Secret 填到这里。</p>
          <ol>
            <li>Google Cloud Console 新建项目。</li>
            <li>启用 Google Calendar API 和 Tasks API。</li>
            <li>OAuth 同意屏幕添加 calendar、tasks、openid、email 范围。</li>
            <li>创建 OAuth 2.0 客户端 ID，应用类型选择桌面应用。</li>
            <li>保存后回到日历页登录。</li>
          </ol>
        </div>
        <form className="settings-form" onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}>
          <label>
            <span>Client ID</span>
            <input value={form.clientId || ""} onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
          </label>
          <label>
            <span>Client Secret</span>
            <input value={form.clientSecret || ""} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} />
          </label>
          <label>
            <span>代理（可选）</span>
            <input placeholder="http://127.0.0.1:7890" value={form.proxy || ""} onChange={(e) => setForm({ ...form, proxy: e.target.value })} />
          </label>
          {error ? <div className="error">{error}</div> : null}
          <div className="form-actions">
            <button type="button" className="btn" onClick={onBack}>返回</button>
            <button className="btn primary">保存设置</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AuthPage({ settings, onLogin, onSettings, loading, error }) {
  const ready = settings.clientId && settings.clientSecret;
  return (
    <div className="center-page">
      <section className="auth-shell">
        <div className="app-icon">W</div>
        <h1>WebClaw Calendar</h1>
        <p>一个本地 Tauri 日历桌面应用，使用你的 Google OAuth 凭据访问 Calendar 与 Tasks。</p>
        {error ? <div className="error">{error}</div> : null}
        <div className="auth-actions">
          <button className="btn primary" onClick={onLogin} disabled={!ready || loading}>
            {loading ? "等待 Google 授权..." : "Login with Google"}
          </button>
          <button className="btn" onClick={onSettings}>{ready ? "设置" : "填写 OAuth 设置"}</button>
        </div>
      </section>
    </div>
  );
}

function App() {
  const [page, setPage] = useState("calendar");
  const [settings, setSettings] = useState({ clientId: "", clientSecret: "", proxy: "" });
  const [auth, setAuth] = useState({ authenticated: false, email: null });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendars, setCalendars] = useState([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState([]);
  const [taskLists, setTaskLists] = useState([]);
  const [activeTaskListId, setActiveTaskListId] = useState("");
  const [events, setEvents] = useState([]);
  const [tasksByList, setTasksByList] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const weekStart = useMemo(() => mondayOf(selectedDate), [selectedDate.getTime()]);

  const loadBase = useCallback(async () => {
    setError("");
    const [loadedSettings, status] = await Promise.all([
      Bridge.loadSettings(),
      Bridge.getAuthStatus(),
    ]);
    setSettings(loadedSettings);
    setAuth(status);
    if (!status.authenticated) return;

    const [calendarResult, taskListResult] = await Promise.allSettled([
      Bridge.listCalendars(),
      Bridge.listTaskLists(),
    ]);
    if (calendarResult.status === "fulfilled") {
      setCalendars(calendarResult.value);
      setSelectedCalendarIds((prev) => prev.length ? prev : calendarResult.value.filter((c) => c.selected).map((c) => c.id));
    } else {
      setError(calendarResult.reason?.message || String(calendarResult.reason));
    }
    if (taskListResult.status === "fulfilled") {
      setTaskLists(taskListResult.value);
      setActiveTaskListId((prev) => prev || taskListResult.value[0]?.id || "");
    }
  }, []);

  const loadWeekData = useCallback(async () => {
    if (!auth.authenticated) return;
    setLoading(true);
    setError("");
    const timeMin = rfc3339(weekStart);
    const timeMax = rfc3339(addDays(weekStart, 7));
    try {
      const selectedCalendars = calendars.filter((c) => selectedCalendarIds.includes(c.id));
      const eventResults = await Promise.allSettled(selectedCalendars.map((cal) => (
        Bridge.getEvents(cal.id, timeMin, timeMax, cal.backgroundColor)
      )));
      const taskResults = await Promise.allSettled(taskLists.map((list) => Bridge.getTasks(list.id)));
      setEvents(eventResults.flatMap((r) => r.status === "fulfilled" ? r.value : []));
      const nextTasks = {};
      taskResults.forEach((r, idx) => {
        if (r.status === "fulfilled") nextTasks[taskLists[idx].id] = r.value;
      });
      setTasksByList(nextTasks);
      const failed = [...eventResults, ...taskResults].find((r) => r.status === "rejected");
      if (failed) setError(failed.reason?.message || String(failed.reason));
    } finally {
      setLoading(false);
    }
  }, [auth.authenticated, calendars, selectedCalendarIds, taskLists, weekStart.getTime()]);

  useEffect(() => {
    loadBase().catch((e) => setError(e.message || String(e)));
  }, []);

  useEffect(() => {
    loadWeekData().catch((e) => setError(e.message || String(e)));
  }, [loadWeekData]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowLeft") setSelectedDate((d) => addDays(d, -7));
      if (e.key === "ArrowRight") setSelectedDate((d) => addDays(d, 7));
      if (e.key.toLowerCase() === "t") setSelectedDate(new Date());
    }
    window.addEventListener("keydown", onKey);
    const interval = setInterval(() => {
      if (!document.hidden) loadWeekData().catch((err) => setError(err.message || String(err)));
    }, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearInterval(interval);
    };
  }, [loadWeekData]);

  async function saveSettings(next) {
    setError("");
    await Bridge.saveSettings(next);
    setSettings(next);
    setPage("calendar");
  }

  async function login() {
    setLoading(true);
    setError("");
    try {
      const status = await Bridge.startOAuth();
      setAuth(status);
      await loadBase();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function createTask(taskListId, title) {
    const task = await Bridge.createTask({ taskListId, title });
    setTasksByList((prev) => ({ ...prev, [taskListId]: [task, ...(prev[taskListId] || [])] }));
  }

  async function completeTask(task) {
    await Bridge.updateTask({ taskListId: task.taskListId, taskId: task.id, status: "completed" });
    setTasksByList((prev) => ({
      ...prev,
      [task.taskListId]: (prev[task.taskListId] || []).filter((t) => t.id !== task.id),
    }));
  }

  async function deleteTask(task) {
    if (!confirm(`删除任务「${task.title}」？`)) return;
    await Bridge.deleteTask(task.taskListId, task.id);
    setTasksByList((prev) => ({
      ...prev,
      [task.taskListId]: (prev[task.taskListId] || []).filter((t) => t.id !== task.id),
    }));
  }

  async function deleteEvent(event) {
    await Bridge.deleteEvent(event.calendarId, event.id);
    setEvents((prev) => prev.filter((item) => item.id !== event.id));
  }

  const allTasks = Object.values(tasksByList).flat();

  if (page === "settings") {
    return <SettingsPage settings={settings} error={error} onSave={saveSettings} onBack={() => setPage("calendar")} />;
  }

  if (!auth.authenticated) {
    return <AuthPage settings={settings} loading={loading} error={error} onLogin={login} onSettings={() => setPage("settings")} />;
  }

  return (
    <div className="app">
      <MiniCalendar
        value={selectedDate}
        weekStart={weekStart}
        onPickDate={setSelectedDate}
        calendars={calendars}
        selectedCalendarIds={selectedCalendarIds}
        onToggleCalendar={(id) => setSelectedCalendarIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
      />
      <TimeGrid
        weekStart={weekStart}
        events={events}
        tasks={allTasks}
        loading={loading}
        onDeleteEvent={deleteEvent}
        onCompleteTask={completeTask}
        onToday={() => setSelectedDate(new Date())}
        onPrevWeek={() => setSelectedDate((d) => addDays(d, -7))}
        onNextWeek={() => setSelectedDate((d) => addDays(d, 7))}
      />
      <TasksPanel
        taskLists={taskLists}
        tasksByList={tasksByList}
        activeTaskListId={activeTaskListId}
        onSelectList={setActiveTaskListId}
        onCreateTask={createTask}
        onCompleteTask={completeTask}
        onDeleteTask={deleteTask}
        loading={loading}
      />
      <button className="settings-fab" title="设置" onClick={() => setPage("settings")}>⚙</button>
      {error ? <div className="toast">{error}</div> : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
