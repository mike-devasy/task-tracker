/** @format */

const tasks = []
const taskTitle = document.getElementById("task-title")
const taskDescription = document.getElementById("task-description")
const taskDate = document.getElementById("task-due-date")
const taskStatus = document.getElementById("task-status")
const taskPriority = document.getElementById("task-priority")
const form = document.getElementById("task-form")
const taskList = document.getElementById("task-list")
const taskPriorityFilter = document.getElementById("task-priority-filter")
const taskDrawer = document.getElementById("task-drawer")
const taskDrawerContent = document.getElementById("task-drawer-content")
const taskDrawerClose = document.getElementById("task-drawer-close")
function addTask() {
  return {
    id: Date.now(),
    title: taskTitle.value.trim(),
    description: taskDescription.value.trim(),
    dueDate: taskDate.value,
    priority: taskPriority.value,
    status: taskStatus.value,
  }
}

form.addEventListener("submit", function (event) {
  event.preventDefault()
  const task = addTask()
  tasks.push(task)
  console.log(tasks)
  renderTasks()
  updateSidebarCounts()
  form.reset()
})
function renderTasks(list = tasks) {
  taskList.innerHTML = ""
  list.forEach(function (task) {

    const taskItem = document.createElement("div")
    taskItem.classList.add("task-item")
		taskItem.dataset.id = task.id
		    const today = getTodayDate()

        const isOverdue =
          task.dueDate && task.dueDate < today && task.status !== "done"
        if (isOverdue) {
          taskItem.classList.add("is-overdue")
        }
    taskItem.innerHTML = `
				<h3>${task.title}</h3>
				<p class="task-item__description">${task.description}</p>
				<p class="task-item__date">Due Date: ${task.dueDate}</p>
				<p class="task-item__priority">Priority: ${task.priority}</p>
				  <select class="task-item__status" data-id="${task.id}">
    <option value="todo" ${task.status === "todo" ? "selected" : ""}>To do</option>
    <option value="in_progress" ${task.status === "in_progress" ? "selected" : ""}>In progress</option>
    <option value="done" ${task.status === "done" ? "selected" : ""}>Done</option>
  </select>
				<button class="task-item__delete" data-id="${task.id}">Delete</button>
			`
    taskList.appendChild(taskItem)
  })
}
function deleteTask(id) {
  const taskIndex = tasks.findIndex((task) => task.id === id)
  if (taskIndex !== -1) {
    tasks.splice(taskIndex, 1)
    applyFilters()
    updateSidebarCounts()
  }
}
taskList.addEventListener("click", function (event) {
  if (event.target.classList.contains("task-item__delete")) {
    const taskId = Number(event.target.dataset.id)
    deleteTask(taskId)
    return
  }
  const taskItem = event.target.closest(".task-item")
  if (!taskItem) return
  const taskId = Number(taskItem.dataset.id)
  openTaskDrawer(taskId)
})
function changeStatus(id, newStatus) {
  const task = tasks.find((task) => task.id === id)
  if (task) {
    task.status = newStatus
    applyFilters()
  }
}
taskList.addEventListener("change", function (event) {
  if (!event.target.classList.contains("task-item__status")) return
  const taskId = Number(event.target.dataset.id)
  const newStatus = event.target.value
  changeStatus(taskId, newStatus)
})
let currentPriorityFilter = "all"

taskPriorityFilter.addEventListener("change", function (event) {
  currentPriorityFilter = event.target.value
  applyFilters()
})
function applyFilters() {
  let filteredTasks = filterTasksBySidebar(currentSidebarFilter)

  if (currentPriorityFilter !== "all") {
    filteredTasks = filteredTasks.filter(
      (task) => task.priority === currentPriorityFilter,
    )
  }

  renderTasks(filteredTasks)
}
function openTaskDrawer(id) {
  const task = tasks.find((task) => task.id === id)
  if (!task) return
  taskDrawerContent.innerHTML = `
	<h3>${task.title}</h3>
				<p class="task-item__description">${task.description}</p>
				<p>Due Date:<br> ${task.dueDate}</p>
				<p>Priority:<br> ${task.priority}</p>
				<p>Status</p>
 
	<p class="task-item__status">${task.status}</p>
	<div class="task-drawer__actions">
		<button class="task-item__edit" data-id="${task.id}">Edit</button>
		<button class="task-item__delete task-item__delete--drawer" data-id="${task.id}">Delete</button>
		</div>
				`

  taskDrawer.classList.add("is-open")
}
taskDrawerContent.addEventListener("change", function (event) {
  if (!event.target.classList.contains("task-item__status")) return

  const taskId = Number(event.target.dataset.id)
  const newStatus = event.target.value
  changeStatus(taskId, newStatus)
})
taskDrawerContent.addEventListener("click", function (event) {
  if (!event.target.classList.contains("task-item__edit")) return
  const taskId = Number(event.target.dataset.id)
  const task = tasks.find((task) => task.id === taskId)
  if (!task) return
  openEditMode(task)
})
taskDrawerClose.addEventListener("click", function (event) {
  taskDrawer.classList.remove("is-open")
})
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    taskDrawer.classList.remove("is-open")
  }
})
function openEditMode(task) {
  taskDrawerContent.innerHTML = `
    <h2>Edit task</h2>
    <input
      class="task-drawer__input"
      id="edit-title"
      type="text"
      value="${task.title}"
    >
    <textarea
      class="task-drawer__textarea"
      id="edit-description"
    >${task.description}</textarea>
    <input
      id="edit-date"
      type="date"
      value="${task.dueDate}"
    >
    <select id="edit-priority">
      <option value="low" ${task.priority === "low" ? "selected" : ""}>Low</option>
      <option value="medium" ${task.priority === "medium" ? "selected" : ""}>Medium</option>
      <option value="high" ${task.priority === "high" ? "selected" : ""}>High</option>
    </select>
    <select id="edit-status">
      <option value="todo" ${task.status === "todo" ? "selected" : ""}>To do</option>
      <option value="in_progress" ${task.status === "in_progress" ? "selected" : ""}>In progress</option>
      <option value="done" ${task.status === "done" ? "selected" : ""}>Done</option>
    </select>
	<div class="task-drawer__actions">
    <button
      class="task-drawer__save"
      data-id="${task.id}"
      type="button"
    >
      Save
    </button>
    <button
      class="task-drawer__cancel"
      data-id="${task.id}"
      type="button"
    >
      Cancel
    </button>
		</div>
  `
}
taskDrawerContent.addEventListener("click", function (event) {
	if (!event.target.classList.contains("task-drawer__cancel")) return
	  const taskId = Number(event.target.dataset.id)

  openTaskDrawer(taskId)
})
taskDrawerContent.addEventListener("click", function (event) {
  if (!event.target.classList.contains("task-drawer__save")) return

  const taskId = Number(event.target.dataset.id)
  const task = tasks.find((task) => task.id === taskId)
  if (!task) return
  task.title = document.getElementById("edit-title").value.trim()
  task.description = document.getElementById("edit-description").value.trim()
  task.dueDate = document.getElementById("edit-date").value
  task.priority = document.getElementById("edit-priority").value
  task.status = document.getElementById("edit-status").value
  renderTasks()
  updateSidebarCounts()
	applyFilters()
  taskDrawer.classList.remove("is-open")
})
taskDrawerContent.addEventListener("click", function (event) {
  if (!event.target.classList.contains("task-item__delete")) return
  const taskId = Number(event.target.dataset.id)
  const isConfirmed = confirm("Удалить эту задачу?")
  if (!isConfirmed) return
  deleteTask(taskId)
  updateSidebarCounts()
  applyFilters()
  taskDrawer.classList.remove("is-open")
})
let currentSidebarFilter = "all"
function filterTasksBySidebar(filter) {
  const today = getTodayDate()
  if (filter === "all") {
    return tasks
  }
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
const appSidebar = document.querySelector(".app-sidebar")
appSidebar.addEventListener("click", function (event) {
  const button = event.target.closest(".app-sidebar__item")

  if (!button) return

  currentSidebarFilter = button.dataset.filter

  applyFilters()
})
function updateSidebarCounts() {
  const today = getTodayDate()

  const countAll = document.getElementById("count-all")
  const countToday = document.getElementById("count-today")
  const countUpcoming = document.getElementById("count-upcoming")
  const countCompleted = document.getElementById("count-completed")
  const countOverdue = document.getElementById("count-overdue")
  countAll.textContent = tasks.length

  countToday.textContent = tasks.filter((task) => task.dueDate === today).length

  countUpcoming.textContent = tasks.filter(
    (task) => task.dueDate > today && task.status !== "done",
  ).length

  countCompleted.textContent = tasks.filter(
    (task) => task.status === "done",
  ).length
  countOverdue.textContent = tasks.filter(
    (task) => task.dueDate && task.dueDate < today && task.status !== "done",
  ).length
}
function getTodayDate() {
  return new Date().toISOString().split("T")[0]
}
