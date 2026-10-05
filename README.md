# Task Tracker

A small task management application with server-side persistence. Tasks can be created, viewed, edited, deleted, filtered, searched, and sorted from a responsive interface.

## Stack

- HTML
- SCSS/CSS
- Vanilla JavaScript
- PHP with PDO
- MySQL

## Features

- MySQL-backed CRUD
- Date, status, and priority filters
- Search by title and description
- Sort by due date, priority, or task id
- Task details, create, and edit drawers
- Loading, empty, error, and delete-confirmation states
- Responsive table/card layouts

## Architecture

The browser loads `index.html` and sends JSON requests with `fetch()` to `api/tasks.php`. The PHP endpoint validates task data and uses the PDO connection supplied by `api/db.php` to read and write the MySQL `tasks` table. After every successful write, the frontend performs a new GET so MySQL remains the source of truth.

## Running locally

Requirements: PHP with the `pdo_mysql` extension, MySQL, and an existing `tasks` table with the fields used by the API (`id`, `title`, `description`, `due_date`, `priority`, and `status`).

1. Add `api/db.php` and create a PDO instance in `$pdo` using local database credentials.
2. From the project directory, run `php -S localhost:8000`.
3. Open `http://localhost:8000`.

Keep database credentials outside version control.

## Shared hosting

Upload the project to the site document root, keep the `/api` path intact, and provide the server-specific `api/db.php`. The hosting account must have PHP, PDO MySQL, and access to the configured MySQL database.
