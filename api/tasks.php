<?php
header('Content-Type: application/json; charset=utf-8');
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST') {
    $input = file_get_contents('php://input');

    $task = json_decode($input, true);

    echo json_encode([
        'success' => true,
        'task' => $task
    ]);

    exit;
}
$tasks = [
    [
        "id" => 1,
        "title" => "Learn PHP API",
        "description" => "Understand GET and JSON",
        "dueDate" => "2026-09-30",
        "priority" => "high",
        "status" => "todo"
    ],
    [
        "id" => 2,
        "title" => "Connect frontend",
        "description" => "Load tasks with fetch",
        "dueDate" => "2026-10-01",
        "priority" => "medium",
        "status" => "in_progress"
    ]
];

echo json_encode($tasks); 
?>