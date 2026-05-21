const { useEffect, useMemo, useRef, useState } = React;

const HOUR_HEIGHT_PX = 60;

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function sameDay(a, b) {
  return a && b && dayKey(a) === dayKey(b);
}

function formatHour(h) {
  return `${String(h).padStart(2, "0")}:00`;
}

function layoutTimedItems(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const cols = [];
  const laid = [];
  sorted.forEach((item) => {
    const startMin = minutesOfDay(item.start);
    const endMin = Math.max(minutesOfDay(item.end || item.start), startMin + 30);
    let colIndex = cols.findIndex((end) => end <= startMin);
    if (colIndex === -1) {
      colIndex = cols.length;
      cols.push(endMin);
    } else {
      cols[colIndex] = endMin;
    }
    laid.push({ ...item, colIndex, startMin, endMin });
  });
  const totalCols = Math.max(cols.length, 1);
  return laid.map((item) => ({ ...item, totalCols }));
}

function TimeGrid({ weekStart, events, tasks, loading, onDeleteEvent, onCompleteTask, onToday, onPrevWeek, onNextWeek }) {
  const scrollRef = useRef(null);
  const [now, setNow] = useState(new Date());
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  }), [weekStart.getTime()]);

  const taskItems = tasks.filter((task) => task.due).map((task) => ({
    ...task,
    summary: task.title,
    start: task.due,
    end: task.due,
    isAllDay: true,
  }));
  const allItems = [...events, ...taskItems];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = Math.max(0, minutesOfDay(new Date()) - 120);
    el.scrollTop = target;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const title = `${days[0].toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} - ${days[6].toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}`;

  return (
    <main className="calendar-main">
      <header className="week-toolbar">
        <div className="week-left">
          <button className="btn" onClick={onToday}>今天</button>
          <button className="icon-btn" title="上一周" onClick={onPrevWeek}>‹</button>
          <button className="icon-btn" title="下一周" onClick={onNextWeek}>›</button>
          <h1>{title}</h1>
        </div>
        <div className="week-status">{loading ? "同步中" : "已同步"}</div>
      </header>

      <div className="day-header">
        <div className="time-gutter" />
        {days.map((d) => (
          <div className={`day-head-cell ${sameDay(d, now) ? "today" : ""}`} key={d.toISOString()}>
            <span>{d.toLocaleDateString("zh-CN", { weekday: "short" })}</span>
            <strong>{d.getDate()}</strong>
          </div>
        ))}
      </div>

      <div className="all-day-row">
        <div className="time-gutter all-label">全天</div>
        {days.map((day) => {
          const items = allItems.filter((item) => item.isAllDay && item.start && sameDay(item.start, day));
          return (
            <div className="all-day-cell" key={day.toISOString()}>
              {items.map((item) => item.type === "task" ? (
                <button className="all-day-task" key={item.id} onClick={() => onCompleteTask(item)}>✓ {item.title}</button>
              ) : (
                <button
                  className="all-day-event"
                  key={item.id}
                  style={{ background: item.calendarColor }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (confirm(`删除事件「${item.summary}」？`)) onDeleteEvent(item);
                  }}
                >
                  {item.summary}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <div className="grid-scroll" ref={scrollRef}>
        <div className="time-column">
          {Array.from({ length: 24 }, (_, h) => <div className="hour-label" key={h}>{formatHour(h)}</div>)}
        </div>
        <div className="days-grid">
          {days.map((day) => {
            const timed = allItems.filter((item) => !item.isAllDay && item.start && sameDay(item.start, day));
            return (
              <div className="day-column" key={day.toISOString()}>
                {Array.from({ length: 24 }, (_, h) => <div className="hour-line" key={h} />)}
                {sameDay(day, now) ? <div className="now-line" style={{ top: `${minutesOfDay(now)}px` }}><span /></div> : null}
                {layoutTimedItems(timed).map((item) => {
                  const left = (item.colIndex / item.totalCols) * 100;
                  const width = 100 / item.totalCols;
                  const style = {
                    top: `${item.startMin}px`,
                    height: `${Math.max(item.endMin - item.startMin, 30)}px`,
                    left: `calc(${left}% + 3px)`,
                    width: `calc(${width}% - 6px)`,
                  };
                  if (item.type !== "task") style.background = item.calendarColor;
                  return item.type === "task" ? (
                    <button className="event-card task-card" style={style} key={item.id} onClick={() => onCompleteTask(item)}>
                      <span className="task-dot">✓</span>
                      <strong>{item.title}</strong>
                    </button>
                  ) : (
                    <button
                      className="event-card"
                      style={style}
                      key={item.id}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (confirm(`删除事件「${item.summary}」？`)) onDeleteEvent(item);
                      }}
                    >
                      <strong>{item.summary}</strong>
                      <span>{item.start.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
