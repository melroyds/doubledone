// The OpenAPI 3.1 description of the public DoubleDone task API (served at
// /api/v1/openapi.json), plus a self-contained Swagger UI page (served at
// /api/v1/docs) that renders it. The spec is the portfolio + integration artifact:
// a clean, browsable contract for the CRUD surface in api.ts. Kept as a plain object
// so it serializes directly and api.test.ts can assert its shape.

const API_BASE = 'https://api.doubledone.app/api/v1';

const taskResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { type: 'object', properties: { task: { $ref: '#/components/schemas/Task' } }, required: ['task'] } } },
});

export const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'DoubleDone API',
    version: '1.0.0',
    description:
      'A small REST API over your DoubleDone tasks. Authenticate with your own DoubleDone token ' +
      '(in the app: Settings, API access), which scopes every call to your own data through ' +
      'row-level security. The server holds no elevated key. Tokens refresh about hourly.',
  },
  servers: [{ url: API_BASE, description: 'Production' }],
  security: [{ bearerAuth: [] }],
  tags: [{ name: 'tasks', description: 'Your tasks' }],
  paths: {
    '/tasks': {
      get: {
        tags: ['tasks'],
        summary: 'List your tasks',
        operationId: 'listTasks',
        parameters: [
          {
            name: 'today',
            in: 'query',
            required: false,
            description: 'When true, only open, non-recurring tasks due today or undated.',
            schema: { type: 'boolean' },
          },
        ],
        responses: {
          '200': {
            description: 'Your tasks.',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { tasks: { type: 'array', items: { $ref: '#/components/schemas/Task' } } }, required: ['tasks'] },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['tasks'],
        summary: 'Create a task',
        operationId: 'createTask',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskInput' } } } },
        responses: {
          '201': taskResponse('The created task.'),
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/tasks/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, description: 'The task id.', schema: { type: 'string' } }],
      get: {
        tags: ['tasks'],
        summary: 'Get a task',
        operationId: 'getTask',
        responses: {
          '200': taskResponse('The task.'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['tasks'],
        summary: 'Update a task',
        operationId: 'updateTask',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskPatch' } } } },
        responses: {
          '200': taskResponse('The updated task.'),
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['tasks'],
        summary: 'Delete a task',
        operationId: 'deleteTask',
        responses: {
          '204': { description: 'Deleted (a soft delete; the row is tombstoned).' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Your DoubleDone token (Settings, API access). It is a Supabase access token and refreshes about hourly.',
      },
    },
    schemas: {
      Task: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          done: { type: 'boolean' },
          due: { type: ['string', 'null'], format: 'date' },
          createdAt: { type: 'string', format: 'date-time' },
          completedAt: { type: ['string', 'null'], format: 'date-time' },
        },
        required: ['id', 'title', 'done', 'due', 'createdAt', 'completedAt'],
      },
      TaskInput: {
        type: 'object',
        properties: { title: { type: 'string' }, due: { type: ['string', 'null'], format: 'date' } },
        required: ['title'],
      },
      TaskPatch: {
        type: 'object',
        description: 'Any of the fields. Setting done to true stamps completedAt.',
        properties: { title: { type: 'string' }, done: { type: 'boolean' }, due: { type: ['string', 'null'], format: 'date' } },
      },
      Error: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
    },
    responses: {
      BadRequest: { description: 'Invalid request.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Unauthorized: { description: 'Missing or invalid token.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound: { description: 'No such task.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
  },
};

// A self-contained Swagger UI page that loads the spec above. Renders an interactive,
// browsable API console (the artifact a hiring PM or integrator opens).
export const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DoubleDone API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>body { margin: 0; } .topbar { display: none; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({ url: '/api/v1/openapi.json', dom_id: '#swagger-ui', deepLinking: true });
  </script>
</body>
</html>`;
