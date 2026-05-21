const { useMemo } = React;

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameDate(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function MiniCalendar({ value, weekStart, onPickDate, calendars, selectedCalendarIds, onToggleCalendar }) {
  const today = new Date();
  const month = startOfMonth(value);
  const cells = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [month.getFullYear(), month.getMonth()]);

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">W</div>
        <div>
          <div className="brand-title">WebClaw Calendar</div>
          <div className="brand-sub">Google Calendar + Tasks</div>
        </div>
      </div>

      <div className="mini-card">
        <div className="mini-head">
          <strong>{month.toLocaleDateString("zh-CN", { year: "numeric", month: "long" })}</strong>
          <button className="icon-btn" title="今天" onClick={() => onPickDate(new Date())}>T</button>
        </div>
        <div className="mini-weekdays">
          {["一", "二", "三", "四", "五", "六", "日"].map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="mini-grid">
          {cells.map((d) => {
            const inMonth = d.getMonth() === month.getMonth();
            const inWeek = d >= weekStart && d < new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
            return (
              <button
                key={d.toISOString()}
                className={[
                  "mini-day",
                  inMonth ? "" : "muted",
                  sameDate(d, today) ? "today" : "",
                  inWeek ? "in-week" : "",
                  sameDate(d, value) ? "picked" : "",
                ].join(" ")}
                onClick={() => onPickDate(d)}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="calendar-list">
        <div className="section-title">日历</div>
        {calendars.length === 0 ? (
          <div className="empty">登录后显示日历列表</div>
        ) : calendars.map((cal) => (
          <label className="calendar-row" key={cal.id}>
            <input
              type="checkbox"
              checked={selectedCalendarIds.includes(cal.id)}
              onChange={() => onToggleCalendar(cal.id)}
            />
            <span className="cal-dot" style={{ background: cal.backgroundColor }} />
            <span className="cal-name">{cal.summary}</span>
            {cal.primary ? <span className="pill">主</span> : null}
          </label>
        ))}
      </div>
    </aside>
  );
}
