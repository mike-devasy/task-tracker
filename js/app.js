/** @format */

const API_URL = "api/tasks.php"

let tasks = []
let currentPriorityFilter = "all"
let currentSidebarFilter = "all"
let currentSearchQuery = ""
let currentSort = "newest"
let currentView = "list"
let lastFocusedElement = null
let pendingDeleteId = null
let closeDrawerAfterDelete = false
let confirmLastFocusedElement = null
let toastTimer = null
let draggedTaskId = null
const pendingStatusUpdates = new Set()

const taskList = document.getElementById("task-list")
const taskListHeader = document.getElementById("task-list-header")
const taskListHeading = document.getElementById("task-list-heading")
const visibleTaskCount = document.getElementById("visible-task-count")
const tasksPanel = document.querySelector(".tasks-panel")
const taskPriorityFilter = document.getElementById("task-priority-filter")
const taskSearch = document.getElementById("task-search")
const taskSort = document.getElementById("task-sort")
const viewSwitcher = document.querySelector(".view-switcher")
const appSidebar = document.querySelector(".app-sidebar")
const newTaskButton = document.getElementById("new-task-button")
const taskDrawer = document.getElementById("task-drawer")
const taskDrawerTitle = document.getElementById("task-drawer-title")
const taskDrawerContent = document.getElementById("task-drawer-content")
const taskDrawerClose = document.getElementById("task-drawer-close")
const taskDrawerOverlay = document.getElementById("task-drawer-overlay")
const toastRegion = document.getElementById("toast-region")
const deleteConfirmOverlay = document.getElementById("delete-confirm-overlay")
const deleteConfirmDialog = document.getElementById("delete-confirm-dialog")
const deleteConfirmDescription = document.getElementById("delete-confirm-description")
const deleteConfirmCancel = document.getElementById("delete-confirm-cancel")
const deleteConfirmSubmit = document.getElementById("delete-confirm-submit")

const BOARD_COLUMNS = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
]
const BOARD_STATUSES = new Set(BOARD_COLUMNS.map(({ status }) => status))

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function formatDate(dateValue) {
  if (!dateValue) return "No date"

  const [year, month, day] = dateValue.split("-").map(Number)
  const date = new Date(year, month - 1, day)

  if (Number.isNaN(date.getTime())) return dateValue

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

function formatStatus(status) {
  const labels = {
    todo: "To do",
    in_progress: "In progress",
    done: "Done",
  }

  return labels[status] || status
}

function formatPriority(priority) {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

function getTaskFromForm(form) {
  return {
    title: form.querySelector('[name="title"]').value.trim(),
    description: form.querySelector('[name="description"]').value.trim(),
    dueDate: form.querySelector('[name="dueDate"]').value,
    priority: form.querySelector('[name="priority"]').value,
    status: form.querySelector('[name="status"]').value,
  }
}

function renderInitialLoadingState() {
  taskListHeader.hidden = true
  taskList.setAttribute("aria-busy", "true")
  visibleTaskCount.textContent = "Loading tasks…"
  taskList.innerHTML = `
    <div class="loading-state" role="status">
      <span class="visually-hidden">Loading tasks</span>
      ${Array.from(
        { length: 3 },
        () => `
          <span class="loading-row" aria-hidden="true">
            <span class="loading-row__primary"></span>
            <span></span>
            <span></span>
            <span></span>
          </span>
        `,
      ).join("")}
    </div>
  `
}

function renderLoadError() {
  taskListHeader.hidden = true
  taskList.setAttribute("aria-busy", "false")
  visibleTaskCount.textContent = "Tasks unavailable"
  taskList.innerHTML = `
    <div class="empty-state empty-state--error">
      <span class="empty-state__icon" aria-hidden="true">!</span>
      <h3>Could not load tasks</h3>
      <p>Check your connection and try again.</p>
      <button class="button button--secondary empty-state__retry" type="button">
        Try again
      </button>
    </div>
  `
}

function prepareTaskView(list, { animate = true } = {}) {
  taskList.innerHTML = ""
  taskList.classList.toggle("is-entering", animate)
  taskList.classList.remove("task-list--board")
  taskList.setAttribute("aria-busy", "false")
  taskList.setAttribute("role", "list")
  taskList.removeAttribute("aria-label")
  taskListHeader.hidden = list.length === 0 || currentView === "board"
  const hasActiveFilters =
    currentSidebarFilter !== "all" ||
    currentPriorityFilter !== "all" ||
    currentSearchQuery !== ""
  visibleTaskCount.textContent = hasActiveFilters
    ? `${list.length} of ${tasks.length} tasks`
    : `${list.length} ${list.length === 1 ? "task" : "tasks"}`

  if (list.length === 0) {
    const isWorkspaceEmpty = tasks.length === 0
    const hasSearchQuery = currentSearchQuery !== ""

    taskList.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon" aria-hidden="true">✓</span>
        <h3>${
          isWorkspaceEmpty
            ? "Start with your first task"
            : hasSearchQuery
              ? "No matching tasks"
              : "No tasks in this view"
        }</h3>
        <p>
          ${
            isWorkspaceEmpty
              ? "Create a task to begin planning your workspace."
              : hasSearchQuery
                ? "Try a different search term or clear the active filters."
                : "Try another sidebar or priority filter."
          }
        </p>
        ${
          isWorkspaceEmpty
            ? '<button class="button button--secondary empty-state__action" type="button">Create task</button>'
            : '<button class="button button--secondary empty-state__clear" type="button">Clear filters</button>'
        }
      </div>
    `
    return false
  }

  return true
}

function renderTaskList(list, options) {
  if (!prepareTaskView(list, options)) return

  const today = getTodayDate()

  list.forEach(function (task) {
    const taskItem = document.createElement("article")
    const isOverdue =
      task.dueDate && task.dueDate < today && task.status !== "done"

    taskItem.className = "task-item"
    taskItem.dataset.id = task.id
    taskItem.setAttribute("role", "listitem")
    taskItem.tabIndex = 0

    if (isOverdue) taskItem.classList.add("is-overdue")
    if (task.status === "done") taskItem.classList.add("is-completed")

    taskItem.innerHTML = `
      <div class="task-item__primary">
        <h3>${escapeHtml(task.title)}</h3>
        <p class="task-item__description">
          ${escapeHtml(task.description || "No description")}
        </p>
      </div>

      <div class="task-item__meta task-item__date" data-label="Due date">
        ${escapeHtml(formatDate(task.dueDate))}
      </div>

      <div class="task-item__meta" data-label="Priority">
        <span class="badge badge--priority-${escapeHtml(task.priority)}">
          ${escapeHtml(formatPriority(task.priority))}
        </span>
      </div>

      <div class="task-item__meta" data-label="Status">
        <span class="badge badge--status-${escapeHtml(task.status)}">
          ${escapeHtml(formatStatus(task.status))}
        </span>
      </div>

      <div class="task-item__actions">
        <button
          class="button-link task-item__view"
          data-id="${task.id}"
          type="button"
          aria-label="View ${escapeHtml(task.title)} details"
        >
          View
        </button>
        <button
          class="button-link button-link--danger task-item__delete"
          data-id="${task.id}"
          type="button"
          aria-label="Delete ${escapeHtml(task.title)}"
        >
          Delete
        </button>
      </div>
    `

    taskList.appendChild(taskItem)
  })
}

function canDragTasks() {
  return window.matchMedia(
    "(hover: hover) and (pointer: fine) and (min-width: 721px)",
  ).matches
}

function createKanbanCard(task) {
  const card = document.createElement("article")
  const isOverdue =
    task.dueDate && task.dueDate < getTodayDate() && task.status !== "done"
  const dragEnabled = canDragTasks() && !pendingStatusUpdates.has(task.id)

  card.className = "kanban-card"
  card.dataset.id = task.id
  card.setAttribute("role", "listitem")
  card.setAttribute("aria-label", `Open ${task.title} details`)
  card.tabIndex = 0
  card.draggable = dragEnabled

  if (dragEnabled) {
    card.title = "Drag to change status"
  }
  if (isOverdue) card.classList.add("is-overdue")
  if (task.status === "done") card.classList.add("is-completed")
  if (pendingStatusUpdates.has(task.id)) {
    card.classList.add("is-updating")
    card.setAttribute("aria-busy", "true")
  }

  card.innerHTML = `
    <h4>${escapeHtml(task.title)}</h4>
    <p>${escapeHtml(task.description || "No description")}</p>
    <div class="kanban-card__footer">
      <span class="badge badge--priority-${escapeHtml(task.priority)}">
        ${escapeHtml(formatPriority(task.priority))}
      </span>
      <span class="kanban-card__date">${escapeHtml(formatDate(task.dueDate))}</span>
    </div>
  `

  return card
}

function getDraggedTask(event) {
  const transferredTaskId = Number(event.dataTransfer?.getData("text/plain"))
  const taskId = draggedTaskId || transferredTaskId
  return tasks.find((task) => task.id === taskId)
}

function handleKanbanDragOver(event) {
  const column = event.currentTarget
  const task = getDraggedTask(event)
  const newStatus = column.dataset.status
  if (!task || !BOARD_STATUSES.has(newStatus)) return

  event.preventDefault()
  event.dataTransfer.dropEffect = "move"
  taskList.querySelectorAll(".kanban-column").forEach((item) => {
    item.classList.toggle("is-drop-target", item === column && task.status !== newStatus)
  })
}

function handleKanbanDragLeave(event) {
  const column = event.currentTarget
  if (column.contains(event.relatedTarget)) return
  column.classList.remove("is-drop-target")
}

async function handleKanbanDrop(event) {
  const column = event.currentTarget
  const task = getDraggedTask(event)
  const newStatus = column.dataset.status
  const isValidDrop = Boolean(task && BOARD_STATUSES.has(newStatus))

  if (isValidDrop) event.preventDefault()

  clearBoardDragState()
  draggedTaskId = null

  if (!isValidDrop || task.status === newStatus) return
  await updateTaskStatus(task.id, newStatus)
}

function renderBoard(list, options) {
  if (!prepareTaskView(list, options)) return

  taskListHeader.hidden = true
  taskList.classList.add("task-list--board")
  taskList.setAttribute("role", "region")
  taskList.setAttribute("aria-label", "Kanban board")

  const board = document.createElement("div")
  board.className = "kanban-board"

  BOARD_COLUMNS.forEach(({ status, label }) => {
    const columnTasks = list.filter((task) => task.status === status)
    const column = document.createElement("section")
    const headingId = `kanban-${status}-heading`

    column.className = "kanban-column"
    column.dataset.status = status
    column.setAttribute("aria-labelledby", headingId)
    column.innerHTML = `
      <header class="kanban-column__header">
        <h3 id="${headingId}">${label}</h3>
        <span
          class="kanban-column__count"
          aria-label="${columnTasks.length} ${columnTasks.length === 1 ? "task" : "tasks"}"
        >
          ${columnTasks.length}
        </span>
      </header>
      <div class="kanban-column__tasks" role="list" aria-label="${label} tasks"></div>
    `

    const columnList = column.querySelector(".kanban-column__tasks")
    if (columnTasks.length === 0) {
      columnList.innerHTML = '<p class="kanban-column__empty">No tasks</p>'
    } else {
      columnTasks.forEach((task) => columnList.appendChild(createKanbanCard(task)))
    }

    column.addEventListener("dragenter", handleKanbanDragOver)
    column.addEventListener("dragover", handleKanbanDragOver)
    column.addEventListener("dragleave", handleKanbanDragLeave)
    column.addEventListener("drop", handleKanbanDrop)

    board.appendChild(column)
  })

  taskList.appendChild(board)
}

function renderTasks(list = tasks, options = {}) {
  if (currentView === "board") {
    renderBoard(list, options)
    return
  }

  renderTaskList(list, options)
}

function setOperationLoading(isLoading) {
  tasksPanel.classList.toggle("is-loading", isLoading)
  tasksPanel.setAttribute("aria-busy", String(isLoading))
  taskList.setAttribute("aria-busy", String(isLoading))
}

function setFormSubmitting(form, isSubmitting, loadingLabel) {
  const submitButton = form.querySelector('button[type="submit"]')
  if (!submitButton) return

  if (isSubmitting) {
    submitButton.dataset.defaultLabel = submitButton.textContent
    submitButton.textContent = loadingLabel
  } else if (submitButton.dataset.defaultLabel) {
    submitButton.textContent = submitButton.dataset.defaultLabel
    delete submitButton.dataset.defaultLabel
  }

  submitButton.disabled = isSubmitting
}

function showToast(message, type = "error") {
  window.clearTimeout(toastTimer)
  toastRegion.innerHTML = ""

  const toast = document.createElement("div")
  toast.className = `toast toast--${type}`
  toast.setAttribute("role", type === "error" ? "alert" : "status")

  const text = document.createElement("span")
  text.textContent = message

  const closeButton = document.createElement("button")
  closeButton.className = "toast__close"
  closeButton.type = "button"
  closeButton.setAttribute("aria-label", "Dismiss notification")
  closeButton.textContent = "×"
  closeButton.addEventListener("click", () => toast.remove())

  toast.append(text, closeButton)
  toastRegion.appendChild(toast)
  requestAnimationFrame(() => toast.classList.add("is-visible"))

  toastTimer = window.setTimeout(() => toast.remove(), 4500)
}

function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hidden)
}

function trapFocus(event, container) {
  if (event.key !== "Tab") return

  const focusableElements = getFocusableElements(container)
  if (focusableElements.length === 0) return

  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault()
    lastElement.focus()
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault()
    firstElement.focus()
  }
}

function openDeleteConfirm(id, { closeDrawerOnSuccess = false } = {}) {
  const task = tasks.find((item) => item.id === id)
  if (!task) return

  pendingDeleteId = id
  closeDrawerAfterDelete = closeDrawerOnSuccess
  confirmLastFocusedElement = document.activeElement
  deleteConfirmDescription.textContent = `“${task.title}” will be permanently removed from your workspace.`
  deleteConfirmOverlay.hidden = false
  document.body.classList.add("confirm-open")

  if (taskDrawer.classList.contains("is-open")) {
    taskDrawer.setAttribute("aria-hidden", "true")
  }

  requestAnimationFrame(() => {
    deleteConfirmOverlay.classList.add("is-visible")
    deleteConfirmCancel.focus()
  })
}

function closeDeleteConfirm({ restoreFocus = true } = {}) {
  deleteConfirmOverlay.classList.remove("is-visible")
  deleteConfirmOverlay.hidden = true
  document.body.classList.remove("confirm-open")
  pendingDeleteId = null
  closeDrawerAfterDelete = false

  if (taskDrawer.classList.contains("is-open")) {
    taskDrawer.setAttribute("aria-hidden", "false")
  }

  if (
    restoreFocus &&
    confirmLastFocusedElement &&
    document.contains(confirmLastFocusedElement)
  ) {
    confirmLastFocusedElement.focus()
  }

  confirmLastFocusedElement = null
}

function openDrawer(title) {
  if (!taskDrawer.classList.contains("is-open")) {
    lastFocusedElement = document.activeElement
  }
  taskDrawerTitle.textContent = title
  taskDrawer.classList.add("is-open")
  taskDrawerOverlay.classList.add("is-visible")
  taskDrawer.setAttribute("aria-hidden", "false")
  document.body.classList.add("drawer-open")

  requestAnimationFrame(() => {
    const firstField = taskDrawerContent.querySelector("input, textarea, select")
    ;(firstField || taskDrawerClose).focus()
  })
}

function closeDrawer() {
  taskDrawer.classList.remove("is-open")
  taskDrawerOverlay.classList.remove("is-visible")
  taskDrawer.setAttribute("aria-hidden", "true")
  document.body.classList.remove("drawer-open")
  taskDrawerContent.innerHTML = ""

  const focusTarget =
    lastFocusedElement && document.contains(lastFocusedElement)
      ? lastFocusedElement
      : taskListHeading
  focusTarget.focus()
  lastFocusedElement = null
}

function openCreateMode() {
  taskDrawerContent.innerHTML = `
    <form class="drawer-form" id="task-form">
      <p class="drawer-form__intro">
        Add the essentials now. You can refine the task later.
      </p>

      <label class="field">
        <span class="field__label">Title <span aria-hidden="true">*</span></span>
        <input
          class="field__control"
          name="title"
          type="text"
          placeholder="What needs to be done?"
          required
        />
      </label>

      <label class="field">
        <span class="field__label">Description</span>
        <textarea
          class="field__control field__control--textarea"
          name="description"
          placeholder="Add context or next steps"
        ></textarea>
      </label>

      <div class="drawer-form__grid">
        <label class="field">
          <span class="field__label">Due date</span>
          <input class="field__control" name="dueDate" type="date" />
        </label>

        <label class="field">
          <span class="field__label">Priority</span>
          <select class="field__control" name="priority">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>

      <label class="field">
        <span class="field__label">Status</span>
        <select class="field__control" name="status">
          <option value="todo" selected>To do</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>
      </label>

      <div class="task-drawer__actions">
        <button class="button button--secondary task-drawer__cancel-create" type="button">
          Cancel
        </button>
        <button class="button button--primary" type="submit">Create task</button>
      </div>
    </form>
  `

  openDrawer("Create task")
}

function openTaskDrawer(id) {
  const task = tasks.find((item) => item.id === id)
  if (!task) return

  taskDrawerContent.innerHTML = `
    <article class="task-details">
      <div class="task-details__heading">
        <h3>${escapeHtml(task.title)}</h3>
        <span class="badge badge--status-${escapeHtml(task.status)}">
          ${escapeHtml(formatStatus(task.status))}
        </span>
      </div>

      <section class="task-details__section" aria-labelledby="description-label">
        <h4 id="description-label">Description</h4>
        <p>${escapeHtml(task.description || "No description provided.")}</p>
      </section>

      <dl class="task-details__grid">
        <div>
          <dt>Due date</dt>
          <dd class="${
            task.dueDate && task.dueDate < getTodayDate() && task.status !== "done"
              ? "is-overdue"
              : ""
          }">${escapeHtml(formatDate(task.dueDate))}</dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>
            <span class="badge badge--priority-${escapeHtml(task.priority)}">
              ${escapeHtml(formatPriority(task.priority))}
            </span>
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span class="badge badge--status-${escapeHtml(task.status)}">
              ${escapeHtml(formatStatus(task.status))}
            </span>
          </dd>
        </div>
      </dl>

      <div class="task-drawer__actions">
        <button
          class="button button--secondary task-item__edit"
          data-id="${task.id}"
          type="button"
          aria-label="Edit ${escapeHtml(task.title)}"
        >
          Edit
        </button>
        <button
          class="button button--danger task-item__delete"
          data-id="${task.id}"
          type="button"
          aria-label="Delete ${escapeHtml(task.title)}"
        >
          Delete
        </button>
      </div>
    </article>
  `

  openDrawer("Task details")
}

function openEditMode(task) {
  taskDrawerContent.innerHTML = `
    <form class="drawer-form" id="edit-task-form" data-id="${task.id}">
      <label class="field">
        <span class="field__label">Title <span aria-hidden="true">*</span></span>
        <input
          class="field__control"
          name="title"
          type="text"
          value="${escapeHtml(task.title)}"
          required
        />
      </label>

      <label class="field">
        <span class="field__label">Description</span>
        <textarea class="field__control field__control--textarea" name="description">${escapeHtml(
          task.description,
        )}</textarea>
      </label>

      <div class="drawer-form__grid">
        <label class="field">
          <span class="field__label">Due date</span>
          <input
            class="field__control"
            name="dueDate"
            type="date"
            value="${escapeHtml(task.dueDate)}"
          />
        </label>

        <label class="field">
          <span class="field__label">Priority</span>
          <select class="field__control" name="priority">
            <option value="low" ${task.priority === "low" ? "selected" : ""}>Low</option>
            <option value="medium" ${task.priority === "medium" ? "selected" : ""}>Medium</option>
            <option value="high" ${task.priority === "high" ? "selected" : ""}>High</option>
          </select>
        </label>
      </div>

      <label class="field">
        <span class="field__label">Status</span>
        <select class="field__control" name="status">
          <option value="todo" ${task.status === "todo" ? "selected" : ""}>To do</option>
          <option value="in_progress" ${task.status === "in_progress" ? "selected" : ""}>In progress</option>
          <option value="done" ${task.status === "done" ? "selected" : ""}>Done</option>
        </select>
      </label>

      <div class="task-drawer__actions">
        <button
          class="button button--secondary task-drawer__cancel"
          data-id="${task.id}"
          type="button"
        >
          Cancel
        </button>
        <button class="button button--primary" type="submit">Save changes</button>
      </div>
    </form>
  `

  taskDrawerTitle.textContent = "Edit task"
  requestAnimationFrame(() => taskDrawerContent.querySelector('[name="title"]').focus())
}

async function deleteTask(id) {
  await apiRequest(`${API_URL}?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  await loadTasksFromApi()
}

async function createTask(form) {
  setFormSubmitting(form, true, "Creating…")
  setOperationLoading(true)

  try {
    await apiRequest(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getTaskFromForm(form)),
    })
    await loadTasksFromApi()
    closeDrawer()
    showToast("Task created.", "success")
  } catch (error) {
    reportApiError("Could not create the task.", error)
  } finally {
    setOperationLoading(false)
    if (form.isConnected) setFormSubmitting(form, false)
  }
}

async function updateTask(form) {
  const taskId = Number(form.dataset.id)
  setFormSubmitting(form, true, "Saving…")
  setOperationLoading(true)

  try {
    await apiRequest(`${API_URL}?id=${encodeURIComponent(taskId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getTaskFromForm(form)),
    })
    await loadTasksFromApi()
    closeDrawer()
    showToast("Task updated.", "success")
  } catch (error) {
    reportApiError("Could not save the task.", error)
  } finally {
    setOperationLoading(false)
    if (form.isConnected) setFormSubmitting(form, false)
  }
}

async function updateTaskStatus(taskId, newStatus) {
  const task = tasks.find((item) => item.id === taskId)
  if (!task || task.status === newStatus || pendingStatusUpdates.has(taskId)) return

  const previousStatus = task.status
  let putSucceeded = false

  pendingStatusUpdates.add(taskId)
  task.status = newStatus
  updateSidebarCounts()
  applyFilters({ animate: false })
  setOperationLoading(true)

  try {
    await apiRequest(`${API_URL}?id=${encodeURIComponent(taskId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: task.title,
        description: task.description || "",
        dueDate: task.dueDate || "",
        priority: task.priority,
        status: newStatus,
      }),
    })
    putSucceeded = true
    await loadTasksFromApi()
    showToast(`Task moved to ${formatStatus(newStatus)}.`, "success")
  } catch (error) {
    if (!putSucceeded) {
      const currentTask = tasks.find((item) => item.id === taskId)
      if (currentTask) currentTask.status = previousStatus
      updateSidebarCounts()
      applyFilters({ animate: false })
    }

    reportApiError("Could not change the task status.", error)
  } finally {
    pendingStatusUpdates.delete(taskId)
    setOperationLoading(false)

    const currentCard = taskList.querySelector(`.kanban-card[data-id="${taskId}"]`)
    if (currentCard) {
      currentCard.classList.remove("is-updating")
      currentCard.removeAttribute("aria-busy")
      currentCard.draggable = canDragTasks()
    }
  }
}

taskList.addEventListener("click", function (event) {
  if (event.target.closest(".empty-state__retry")) {
    loadTasksFromApi({ showLoading: true }).catch(handleLoadError)
    return
  }

  if (event.target.closest(".empty-state__action")) {
    openCreateMode()
    return
  }

  if (event.target.closest(".empty-state__clear")) {
    resetTaskFilters()
    return
  }

  const deleteButton = event.target.closest(".task-item__delete")
  if (deleteButton) {
    const taskId = Number(deleteButton.dataset.id)
    openDeleteConfirm(taskId)
    return
  }

  const taskItem = event.target.closest(".task-item, .kanban-card")
  if (!taskItem) return
  openTaskDrawer(Number(taskItem.dataset.id))
})

taskList.addEventListener("keydown", function (event) {
  if (event.target !== event.target.closest(".task-item, .kanban-card")) return
  if (event.key !== "Enter" && event.key !== " ") return

  event.preventDefault()
  openTaskDrawer(Number(event.target.dataset.id))
})

function clearBoardDragState() {
  taskList.querySelectorAll(".kanban-card.is-dragging").forEach((card) => {
    card.classList.remove("is-dragging")
  })
  taskList.querySelectorAll(".kanban-column.is-drop-target").forEach((column) => {
    column.classList.remove("is-drop-target")
  })
}

taskList.addEventListener("dragstart", function (event) {
  const card = event.target.closest(".kanban-card")
  if (!card || currentView !== "board" || !canDragTasks()) {
    event.preventDefault()
    return
  }

  const taskId = Number(card.dataset.id)
  if (pendingStatusUpdates.has(taskId)) {
    event.preventDefault()
    return
  }

  draggedTaskId = taskId
  card.classList.add("is-dragging")
  event.dataTransfer.effectAllowed = "move"
  event.dataTransfer.setData("text/plain", String(taskId))
})

taskList.addEventListener("dragend", function () {
  clearBoardDragState()
  draggedTaskId = null
})

taskDrawerContent.addEventListener("submit", function (event) {
  event.preventDefault()

  if (event.target.id === "task-form") {
    createTask(event.target)
  }

  if (event.target.id === "edit-task-form") {
    updateTask(event.target)
  }
})

taskDrawerContent.addEventListener("click", function (event) {
  const editButton = event.target.closest(".task-item__edit")
  if (editButton) {
    const task = tasks.find((item) => item.id === Number(editButton.dataset.id))
    if (task) openEditMode(task)
    return
  }

  const cancelEditButton = event.target.closest(".task-drawer__cancel")
  if (cancelEditButton) {
    openTaskDrawer(Number(cancelEditButton.dataset.id))
    return
  }

  if (event.target.closest(".task-drawer__cancel-create")) {
    closeDrawer()
    return
  }

  const deleteButton = event.target.closest(".task-item__delete")
  if (!deleteButton) return

  const taskId = Number(deleteButton.dataset.id)
  openDeleteConfirm(taskId, { closeDrawerOnSuccess: true })
})

taskPriorityFilter.addEventListener("change", function (event) {
  currentPriorityFilter = event.target.value
  applyFilters()
})

taskSearch.addEventListener("input", function (event) {
  currentSearchQuery = event.target.value.trim().toLocaleLowerCase()
  applyFilters({ animate: false })
})

taskSort.addEventListener("change", function (event) {
  currentSort = event.target.value
  applyFilters()
})

viewSwitcher.addEventListener("click", function (event) {
  const button = event.target.closest("[data-view]")
  if (!button || button.dataset.view === currentView) return

  currentView = button.dataset.view
  viewSwitcher.querySelectorAll("[data-view]").forEach((item) => {
    const isActive = item === button
    item.classList.toggle("is-active", isActive)
    item.setAttribute("aria-pressed", String(isActive))
  })
  applyFilters()
})

appSidebar.addEventListener("click", function (event) {
  const button = event.target.closest(".app-sidebar__item")
  if (!button) return

  currentSidebarFilter = button.dataset.filter
  appSidebar.querySelectorAll(".app-sidebar__item").forEach((item) => {
    item.classList.toggle("is-active", item === button)
  })
  applyFilters()
})

newTaskButton.addEventListener("click", openCreateMode)
taskDrawerClose.addEventListener("click", closeDrawer)
taskDrawerOverlay.addEventListener("click", closeDrawer)
deleteConfirmCancel.addEventListener("click", closeDeleteConfirm)
deleteConfirmOverlay.addEventListener("click", function (event) {
  if (event.target === deleteConfirmOverlay) closeDeleteConfirm()
})

deleteConfirmSubmit.addEventListener("click", async function () {
  if (pendingDeleteId === null) return

  const taskId = pendingDeleteId
  const shouldCloseDrawer = closeDrawerAfterDelete
  deleteConfirmCancel.disabled = true
  deleteConfirmSubmit.disabled = true
  deleteConfirmSubmit.textContent = "Deleting…"
  setOperationLoading(true)

  try {
    await deleteTask(taskId)
    closeDeleteConfirm({ restoreFocus: false })

    if (shouldCloseDrawer && taskDrawer.classList.contains("is-open")) {
      closeDrawer()
    } else {
      taskListHeading.focus()
    }

    showToast("Task deleted.", "success")
  } catch (error) {
    reportApiError("Could not delete the task.", error)
  } finally {
    setOperationLoading(false)
    deleteConfirmCancel.disabled = false
    deleteConfirmSubmit.disabled = false
    deleteConfirmSubmit.textContent = "Delete task"
  }
})

document.addEventListener("keydown", function (event) {
  if (!deleteConfirmOverlay.hidden) {
    if (event.key === "Escape") closeDeleteConfirm()
    trapFocus(event, deleteConfirmDialog)
    return
  }

  if (taskDrawer.classList.contains("is-open")) {
    if (event.key === "Escape") {
      closeDrawer()
      return
    }

    trapFocus(event, taskDrawer)
  }
})

function filterTasksBySidebar(filter) {
  const today = getTodayDate()

  if (filter === "today") {
    return tasks.filter((task) => task.dueDate === today)
  }
  if (filter === "upcoming") {
    return tasks.filter(
      (task) => task.dueDate > today && task.status !== "done",
    )
  }
  if (filter === "completed") {
    return tasks.filter((task) => task.status === "done")
  }
  if (filter === "overdue") {
    return tasks.filter(
      (task) => task.dueDate && task.dueDate < today && task.status !== "done",
    )
  }

  return tasks
}

function sortTasks(list) {
  const sortedTasks = [...list]
  const compareIdsDescending = (taskA, taskB) => Number(taskB.id) - Number(taskA.id)

  if (currentSort === "oldest") {
    return sortedTasks.sort((taskA, taskB) => Number(taskA.id) - Number(taskB.id))
  }

  if (currentSort === "priority") {
    const priorityOrder = { high: 3, medium: 2, low: 1 }
    return sortedTasks.sort(
      (taskA, taskB) =>
        priorityOrder[taskB.priority] - priorityOrder[taskA.priority] ||
        compareIdsDescending(taskA, taskB),
    )
  }

  if (currentSort === "due-asc" || currentSort === "due-desc") {
    const direction = currentSort === "due-asc" ? 1 : -1

    return sortedTasks.sort((taskA, taskB) => {
      if (!taskA.dueDate && !taskB.dueDate) return compareIdsDescending(taskA, taskB)
      if (!taskA.dueDate) return 1
      if (!taskB.dueDate) return -1

      return (
        taskA.dueDate.localeCompare(taskB.dueDate) * direction ||
        compareIdsDescending(taskA, taskB)
      )
    })
  }

  return sortedTasks.sort(compareIdsDescending)
}

function resetTaskFilters() {
  currentSidebarFilter = "all"
  currentPriorityFilter = "all"
  currentSearchQuery = ""
  taskPriorityFilter.value = "all"
  taskSearch.value = ""

  appSidebar.querySelectorAll(".app-sidebar__item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.filter === "all")
  })

  applyFilters()
}

function applyFilters({ animate = true } = {}) {
  let filteredTasks = filterTasksBySidebar(currentSidebarFilter)

  if (currentPriorityFilter !== "all") {
    filteredTasks = filteredTasks.filter(
      (task) => task.priority === currentPriorityFilter,
    )
  }

  if (currentSearchQuery) {
    filteredTasks = filteredTasks.filter((task) => {
      const searchableText = `${task.title} ${task.description || ""}`.toLocaleLowerCase()
      return searchableText.includes(currentSearchQuery)
    })
  }

  renderTasks(sortTasks(filteredTasks), { animate })
}

function updateSidebarCounts() {
  const today = getTodayDate()

  document.getElementById("count-all").textContent = tasks.length
  document.getElementById("count-today").textContent = tasks.filter(
    (task) => task.dueDate === today,
  ).length
  document.getElementById("count-upcoming").textContent = tasks.filter(
    (task) => task.dueDate > today && task.status !== "done",
  ).length
  document.getElementById("count-completed").textContent = tasks.filter(
    (task) => task.status === "done",
  ).length
  document.getElementById("count-overdue").textContent = tasks.filter(
    (task) => task.dueDate && task.dueDate < today && task.status !== "done",
  ).length
}

function getTodayDate() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

async function loadTasksFromApi({ showLoading = false } = {}) {
  if (showLoading) renderInitialLoadingState()

  const data = await apiRequest(API_URL)

  if (!Array.isArray(data.tasks)) {
    throw new Error("API response does not contain a tasks array.")
  }

  tasks = data.tasks
  applyFilters()
  updateSidebarCounts()
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options)
  let payload

  try {
    payload = await response.json()
  } catch (error) {
    throw new Error(`Server returned invalid JSON (HTTP ${response.status}).`)
  }

  if (!response.ok || payload.success !== true) {
    const message = payload.error?.message || `HTTP error: ${response.status}`
    throw new Error(message)
  }

  return payload.data
}

function reportApiError(message, error) {
  console.error(message, error)
  showToast(`${message} ${error.message}`, "error")
}

function handleLoadError(error) {
  renderLoadError()
  reportApiError("Could not load tasks.", error)
}

renderInitialLoadingState()
loadTasksFromApi().catch(handleLoadError)
