<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

const ALLOWED_STATUSES = ['todo', 'in_progress', 'done'];
const ALLOWED_PRIORITIES = ['low', 'medium', 'high'];

function sendJson(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function sendSuccess(int $statusCode, array $data): void
{
    sendJson($statusCode, [
        'success' => true,
        'data' => $data,
    ]);
}

function sendError(int $statusCode, string $code, string $message, array $fields = []): void
{
    $error = [
        'code' => $code,
        'message' => $message,
    ];

    if ($fields !== []) {
        $error['fields'] = $fields;
    }

    sendJson($statusCode, [
        'success' => false,
        'error' => $error,
    ]);
}

function readJsonBody(): array
{
    $rawBody = file_get_contents('php://input');
    $data = json_decode($rawBody === false ? '' : $rawBody, true);

    if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
        sendError(400, 'INVALID_JSON', 'Request body must contain valid JSON.');
    }

    return $data;
}

function validateTask(array $data): array
{
    $errors = [];

    $title = isset($data['title']) && is_string($data['title'])
        ? trim($data['title'])
        : '';
    if ($title === '') {
        $errors['title'] = 'Title is required.';
    }

    $description = isset($data['description']) && is_string($data['description'])
        ? trim($data['description'])
        : '';

    $status = isset($data['status']) && is_string($data['status'])
        ? $data['status']
        : '';
    if (!in_array($status, ALLOWED_STATUSES, true)) {
        $errors['status'] = 'Status must be todo, in_progress, or done.';
    }

    $priority = isset($data['priority']) && is_string($data['priority'])
        ? $data['priority']
        : '';
    if (!in_array($priority, ALLOWED_PRIORITIES, true)) {
        $errors['priority'] = 'Priority must be low, medium, or high.';
    }

    $dueDate = null;
    if (isset($data['dueDate']) && $data['dueDate'] !== '') {
        if (!is_string($data['dueDate'])) {
            $errors['dueDate'] = 'Due date must use YYYY-MM-DD format or be empty.';
        } else {
            $date = DateTime::createFromFormat('!Y-m-d', $data['dueDate']);
            $dateErrors = DateTime::getLastErrors();
            $isValidDate = $date !== false
                && ($dateErrors === false || ($dateErrors['warning_count'] === 0 && $dateErrors['error_count'] === 0))
                && $date->format('Y-m-d') === $data['dueDate'];

            if (!$isValidDate) {
                $errors['dueDate'] = 'Due date must use YYYY-MM-DD format or be empty.';
            } else {
                $dueDate = $data['dueDate'];
            }
        }
    }

    if ($errors !== []) {
        sendError(422, 'VALIDATION_ERROR', 'Task data is invalid.', $errors);
    }

    return [
        'title' => $title,
        'description' => $description,
        'dueDate' => $dueDate,
        'priority' => $priority,
        'status' => $status,
    ];
}

function getTaskId(): int
{
    $id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT, [
        'options' => ['min_range' => 1],
    ]);

    if ($id === false || $id === null) {
        sendError(400, 'INVALID_ID', 'A positive task id is required.');
    }

    return $id;
}

function normalizeTask(array $task): array
{
    return [
        'id' => (int) $task['id'],
        'title' => $task['title'],
        'description' => $task['description'] ?? '',
        'dueDate' => $task['dueDate'] ?? '',
        'priority' => $task['priority'],
        'status' => $task['status'],
    ];
}

function findTask(PDO $pdo, int $id): ?array
{
    $statement = $pdo->prepare(
        'SELECT id, title, description, due_date AS dueDate, priority, status
         FROM tasks
         WHERE id = :id'
    );
    $statement->execute(['id' => $id]);
    $task = $statement->fetch();

    return $task === false ? null : normalizeTask($task);
}

try {
    require_once __DIR__ . '/db.php';
    if (!isset($pdo) || !$pdo instanceof PDO) {
        throw new RuntimeException('Database connection is not available.');
    }

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        $statement = $pdo->prepare(
            'SELECT id, title, description, due_date AS dueDate, priority, status
             FROM tasks
             ORDER BY id DESC'
        );
        $statement->execute();
        $tasks = array_map('normalizeTask', $statement->fetchAll());
        sendSuccess(200, ['tasks' => $tasks]);
    }

    if ($method === 'POST') {
        $task = validateTask(readJsonBody());
        $statement = $pdo->prepare(
            'INSERT INTO tasks (title, description, due_date, priority, status)
             VALUES (:title, :description, :dueDate, :priority, :status)'
        );
        $statement->execute($task);

        $createdTask = findTask($pdo, (int) $pdo->lastInsertId());
        sendSuccess(201, ['task' => $createdTask]);
    }

    if ($method === 'PUT') {
        $id = getTaskId();
        $task = validateTask(readJsonBody());
        $statement = $pdo->prepare(
            'UPDATE tasks
             SET title = :title,
                 description = :description,
                 due_date = :dueDate,
                 priority = :priority,
                 status = :status
             WHERE id = :id'
        );
        $statement->execute(array_merge($task, ['id' => $id]));

        $updatedTask = findTask($pdo, $id);
        if ($updatedTask === null) {
            sendError(404, 'TASK_NOT_FOUND', 'Task not found.');
        }

        sendSuccess(200, ['task' => $updatedTask]);
    }

    if ($method === 'DELETE') {
        $id = getTaskId();
        $statement = $pdo->prepare('DELETE FROM tasks WHERE id = :id');
        $statement->execute(['id' => $id]);

        if ($statement->rowCount() === 0) {
            sendError(404, 'TASK_NOT_FOUND', 'Task not found.');
        }

        sendSuccess(200, ['id' => $id]);
    }

    header('Allow: GET, POST, PUT, DELETE');
    sendError(405, 'METHOD_NOT_ALLOWED', 'HTTP method is not supported.');
} catch (Throwable $error) {
    error_log('Task Tracker API error: ' . $error->getMessage());
    sendError(500, 'SERVER_ERROR', 'The server could not process the request.');
}
