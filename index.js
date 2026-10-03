const STORE_KEY = "taskflow.tasks";
const THEME_KEY = "taskflow.theme";
const RING_CIRCUMFERENCE = 2 * Math.PI * 42;

const el = {
    form: document.getElementById("form"),
    input: document.getElementById("input"),
    due: document.getElementById("due"),
    list: document.getElementById("list"),
    search: document.getElementById("search"),
    empty: document.getElementById("empty"),
    emptyText: document.getElementById("emptyText"),
    ring: document.getElementById("ringFill"),
    pctLabel: document.getElementById("pctLabel"),
    statAll: document.getElementById("statAll"),
    statActive: document.getElementById("statActive"),
    statDone: document.getElementById("statDone"),
    clearDone: document.getElementById("clearDone"),
    themeToggle: document.getElementById("themeToggle"),
    todayLabel: document.getElementById("todayLabel"),
    toast: document.getElementById("toast"),
    toastMsg: document.getElementById("toastMsg"),
    toastAction: document.getElementById("toastAction"),
    confetti: document.getElementById("confetti"),
};

let tasks = loadTasks();
let filter = "all";
let query = "";
let toastTimer = null;
let undoTask = null;

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadTasks() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORE_KEY));
        if (Array.isArray(parsed)) return parsed;
    } catch (error) {
        console.warn("Could not read saved tasks:", error);
    }
    return [
        { id: uid(), text: "Ship the cool to-do list ✨", done: false, priority: "high", due: "", created: Date.now() },
        { id: uid(), text: "Learn something new in JavaScript", done: false, priority: "med", due: "", created: Date.now() + 1 },
        { id: uid(), text: "Read the docs for a new framework", done: true, priority: "low", due: "", created: Date.now() + 2 },
    ];
}

function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(tasks));
}

function startOfToday() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
}

function daysUntil(dateStr) {
    const target = new Date(dateStr + "T00:00:00");
    return Math.round((target - startOfToday()) / 86400000);
}

function dueBadge(task) {
    if (!task.due || task.done) return null;
    const days = daysUntil(task.due);
    if (days < 0) return { text: `${Math.abs(days)}d late`, className: "badge overdue" };
    if (days === 0) return { text: "today", className: "badge soon" };
    if (days === 1) return { text: "tomorrow", className: "badge soon" };
    if (days <= 7) return { text: `${days}d left`, className: "badge" };
    return { text: task.due.slice(5).replace("-", "/"), className: "badge" };
}

function visibleTasks() {
    const term = query.trim().toLowerCase();
    return tasks.filter((task) => {
        if (filter === "active" && task.done) return false;
        if (filter === "done" && !task.done) return false;
        if (term && !task.text.toLowerCase().includes(term)) return false;
        return true;
    });
}

function buildItem(task) {
    const li = document.createElement("li");
    li.className = task.done ? "item done" : "item";
    li.dataset.id = task.id;
    li.dataset.priority = task.priority;
    li.draggable = true;

    const grip = document.createElement("span");
    grip.className = "grip";
    grip.textContent = "⠿";
    grip.title = "Drag to reorder";
    li.append(grip);

    const check = document.createElement("button");
    check.className = "check";
    check.type = "button";
    check.title = "Toggle complete";
    check.setAttribute("aria-pressed", String(task.done));
    li.append(check);

    const text = document.createElement("span");
    text.className = "text";
    text.textContent = task.text;
    text.title = "Double-click to edit";
    li.append(text);

    const badge = dueBadge(task);
    if (badge) {
        const span = document.createElement("span");
        span.className = badge.className;
        span.textContent = badge.text;
        li.append(span);
    }

    const actions = document.createElement("div");
    actions.className = "icon-actions";

    const edit = document.createElement("button");
    edit.className = "mini";
    edit.type = "button";
    edit.textContent = "✎";
    edit.title = "Edit";
    edit.dataset.act = "edit";

    const del = document.createElement("button");
    del.className = "mini del";
    del.type = "button";
    del.textContent = "✕";
    del.title = "Delete";
    del.dataset.act = "delete";

    actions.append(edit, del);
    li.append(actions);
    return li;
}

function render() {
    const shown = visibleTasks();
    el.list.replaceChildren(...shown.map(buildItem));

    const total = tasks.length;
    const done = tasks.filter((task) => task.done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    el.ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - pct / 100);
    el.pctLabel.textContent = pct + "%";
    el.statAll.textContent = total;
    el.statActive.textContent = total - done;
    el.statDone.textContent = done;

    const isEmpty = shown.length === 0;
    el.empty.hidden = !isEmpty;
    el.emptyText.textContent = tasks.length === 0
        ? "Nothing here yet. Add your first task above."
        : query
            ? "No tasks match your search."
            : filter === "done"
                ? "No completed tasks yet. Finish something!"
                : "All clear — every task is done.";

    el.clearDone.textContent = done ? `Clear ${done} completed` : "Clear completed";
}

function addTask(text, priority, due) {
    tasks.unshift({ id: uid(), text, done: false, priority, due, created: Date.now() });
    save();
    render();
    showToast("Task added");
}

function toggleTask(id) {
    const task = tasks.find((entry) => entry.id === id);
    if (!task) return;
    task.done = !task.done;
    save();
    render();
    if (task.done && tasks.length && tasks.every((entry) => entry.done)) celebrate();
}

function deleteTask(id) {
    const index = tasks.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    undoTask = { task: tasks[index], index };
    tasks.splice(index, 1);
    save();
    render();
    showToast("Task deleted", true);
}

function undoDelete() {
    if (!undoTask) return;
    tasks.splice(Math.min(undoTask.index, tasks.length), 0, undoTask.task);
    undoTask = null;
    save();
    render();
}

function startEdit(li, task) {
    if (li.querySelector(".edit-input")) return;
    const text = li.querySelector(".text");
    const input = document.createElement("input");
    input.className = "edit-input";
    input.type = "text";
    input.maxLength = 140;
    input.value = task.text;
    text.replaceWith(input);
    input.focus();
    input.select();

    const commit = (saveEdit) => {
        const value = input.value.trim();
        input.replaceWith(text);
        text.textContent = value || task.text;
        if (saveEdit && value && value !== task.text) {
            task.text = value;
            save();
        }
        render();
    };

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") commit(true);
        if (event.key === "Escape") commit(false);
    });
    input.addEventListener("blur", () => commit(true));
}

function showToast(message, withUndo) {
    el.toastMsg.textContent = message;
    el.toastAction.hidden = !withUndo;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.toast.hidden = true;
        undoTask = null;
    }, 4000);
}

function celebrate() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#7c5cff", "#00d3c7", "#ff4d8d", "#ffb02e", "#37d67a"];
    const bits = [];
    for (let i = 0; i < 60; i += 1) {
        const bit = document.createElement("i");
        bit.style.left = Math.random() * 100 + "vw";
        bit.style.background = colors[i % colors.length];
        bit.style.setProperty("--dx", (Math.random() * 240 - 120) + "px");
        bit.style.setProperty("--rot", (Math.random() * 1080 - 540) + "deg");
        bit.style.animationDelay = Math.random() * 0.7 + "s";
        bits.push(bit);
    }
    el.confetti.replaceChildren(...bits);
    setTimeout(() => el.confetti.replaceChildren(), 3600);
}

el.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = el.input.value.trim();
    if (!text) {
        el.input.focus();
        return;
    }
    const priority = el.form.querySelector('input[name="priority"]:checked').value;
    addTask(text, priority, el.due.value);
    el.input.value = "";
    el.due.value = "";
    el.input.focus();
});

el.list.addEventListener("click", (event) => {
    const li = event.target.closest(".item");
    if (!li) return;
    const task = tasks.find((entry) => entry.id === li.dataset.id);
    if (!task) return;

    if (event.target.closest(".check")) toggleTask(task.id);
    if (event.target.closest('[data-act="delete"]')) deleteTask(task.id);
    if (event.target.closest('[data-act="edit"]')) startEdit(li, task);
});

el.list.addEventListener("dblclick", (event) => {
    if (!event.target.closest(".text")) return;
    const li = event.target.closest(".item");
    const task = tasks.find((entry) => entry.id === li.dataset.id);
    if (task) startEdit(li, task);
});

document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
        document.querySelectorAll(".chip").forEach((other) => other.classList.remove("active"));
        chip.classList.add("active");
        filter = chip.dataset.filter;
        render();
    });
});

let searchTimer = null;
el.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        query = el.search.value;
        render();
    }, 120);
});

el.clearDone.addEventListener("click", () => {
    const removed = tasks.filter((task) => task.done);
    if (!removed.length) return;
    undoTask = { tasks: removed.map((task, i) => ({ task, index: i })), multiple: true };
    tasks = tasks.filter((task) => !task.done);
    save();
    render();
    showToast(`${removed.length} completed removed`, true);
});

el.toastAction.addEventListener("click", () => {
    if (undoTask && undoTask.multiple) {
        undoTask.tasks.forEach(({ task, index }) => tasks.splice(Math.min(index, tasks.length), 0, task));
        undoTask = null;
        save();
        render();
    } else {
        undoDelete();
    }
    el.toast.hidden = true;
    clearTimeout(toastTimer);
});

let dragId = null;
el.list.addEventListener("dragstart", (event) => {
    const li = event.target.closest(".item");
    if (!li) return;
    dragId = li.dataset.id;
    li.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragId);
});

el.list.addEventListener("dragover", (event) => {
    event.preventDefault();
    const li = event.target.closest(".item");
    if (!li || li.dataset.id === dragId) return;
    el.list.querySelectorAll(".drop-target").forEach((node) => node.classList.remove("drop-target"));
    li.classList.add("drop-target");
});

el.list.addEventListener("drop", (event) => {
    event.preventDefault();
    const li = event.target.closest(".item");
    el.list.querySelectorAll(".drop-target").forEach((node) => node.classList.remove("drop-target"));
    if (!li || !dragId || li.dataset.id === dragId) return;

    const from = tasks.findIndex((task) => task.id === dragId);
    const moved = tasks.splice(from, 1)[0];
    const to = tasks.findIndex((task) => task.id === li.dataset.id);
    tasks.splice(to, 0, moved);
    dragId = null;
    save();
    render();
});

el.list.addEventListener("dragend", () => {
    dragId = null;
    el.list.querySelectorAll(".dragging, .drop-target").forEach((node) => node.classList.remove("dragging", "drop-target"));
});

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
}

el.themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    el.themeToggle.querySelector(".theme-icon").textContent = next === "dark" ? "◐" : "◑";
});

document.addEventListener("keydown", (event) => {
    const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);
    if (event.key === "Escape") {
        document.activeElement.blur();
        return;
    }
    if (typing) return;
    if (event.key === "/") {
        event.preventDefault();
        el.search.focus();
    }
    if (event.key === "n") {
        event.preventDefault();
        el.input.focus();
    }
});

el.todayLabel.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
});

applyTheme(localStorage.getItem(THEME_KEY) || "dark");
el.themeToggle.querySelector(".theme-icon").textContent = document.documentElement.dataset.theme === "dark" ? "◐" : "◑";
render();
