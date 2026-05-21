const { useState } = React;

function TasksPanel({ taskLists, tasksByList, activeTaskListId, onSelectList, onCreateTask, onCompleteTask, onDeleteTask, loading }) {
  const [title, setTitle] = useState("");
  const activeList = taskLists.find((l) => l.id === activeTaskListId) || taskLists[0];
  const tasks = activeList ? (tasksByList[activeList.id] || []) : [];

  async function submit(e) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean || !activeList) return;
    await onCreateTask(activeList.id, clean);
    setTitle("");
  }

  return (
    <aside className="tasks-panel">
      <div className="tasks-head">
        <div>
          <div className="panel-title">Tasks</div>
          <div className="panel-sub">{loading ? "正在同步..." : `${tasks.length} 个待办`}</div>
        </div>
      </div>

      <div className="task-list-tabs">
        {taskLists.map((list) => (
          <button
            key={list.id}
            className={`task-tab ${list.id === activeList?.id ? "active" : ""}`}
            onClick={() => onSelectList(list.id)}
            title={list.title}
          >
            {list.title}
          </button>
        ))}
      </div>

      <form className="task-form" onSubmit={submit}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={activeList ? "添加任务" : "暂无任务列表"}
          disabled={!activeList}
        />
        <button className="btn primary" disabled={!activeList || !title.trim()}>添加</button>
      </form>

      <div className="tasks-scroll">
        {!activeList ? (
          <div className="empty">Google Tasks 中暂无任务列表</div>
        ) : tasks.length === 0 ? (
          <div className="empty">这一列很清爽</div>
        ) : tasks.map((task) => (
          <div className="task-item" key={task.id}>
            <button className="task-check" title="完成" onClick={() => onCompleteTask(task)}>✓</button>
            <div className="task-main">
              <div className="task-title">{task.title}</div>
              {task.due ? <div className="task-due">{task.due.toLocaleDateString("zh-CN")}</div> : null}
              {task.notes ? <div className="task-notes">{task.notes}</div> : null}
            </div>
            <button className="icon-btn danger" title="删除" onClick={() => onDeleteTask(task)}>×</button>
          </div>
        ))}
      </div>
    </aside>
  );
}
