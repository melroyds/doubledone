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
    version: '1.2.0',
    description:
      'A small REST API over your DoubleDone tasks. Authenticate with your own DoubleDone token ' +
      '(in the app: Settings, API access), which scopes every call to your own data through ' +
      'row-level security. The server holds no elevated key. Tokens refresh about hourly. ' +
      'Tasks can repeat (daily, on chosen weekdays, every N days, or monthly on a day of the month); a repeat and a due date ' +
      'are mutually exclusive. Listing supports search (q) and a look-ahead window (upcoming).',
  },
  servers: [{ url: API_BASE, description: 'Production' }],
  security: [{ bearerAuth: [] }],
  tags: [{ name: 'tasks', description: 'Your tasks' }],
  paths: {
    '/tasks': {
      get: {
        tags: ['tasks'],
        summary: 'List your tasks',
        description:
          'Lists your tasks. Choose one read mode via a query param; when more than one is given the ' +
          'precedence is q, then upcoming, then today, then a plain list of all your open and dated tasks.',
        operationId: 'listTasks',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: false,
            description: 'Case-insensitive substring search over the titles of your open (not done, not deleted) tasks. Highest precedence.',
            schema: { type: 'string' },
          },
          {
            name: 'upcoming',
            in: 'query',
            required: false,
            description:
              'Look ahead this many days (clamped 1-30, default 7): your future-dated one-off tasks plus the next occurrence of each repeating task within the window. Each returned task carries the day it next lands in `due`. Takes precedence over today.',
            schema: { type: 'integer', minimum: 1, maximum: 30, default: 7 },
          },
          {
            name: 'today',
            in: 'query',
            required: false,
            description: 'When true, only open, non-recurring tasks due today or undated (a decomposed-task umbrella the app hides is excluded, so it matches the app Today).',
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
        description: 'Creates a task. By default it lands on today. Optionally give it a future `due` day OR a `repeat`, never both.',
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
        description: 'Updates a task. Send any of title, done, due, or repeat. Setting a `due` day clears any repeat, and setting a `repeat` clears the due day; pass either as null to clear it.',
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
          due: {
            type: ['string', 'null'],
            format: 'date',
            description: 'The day this one-off task is due, or null. In an `upcoming` listing, a repeating task carries the day it next lands here.',
          },
          recurrence: {
            description: 'The repeat rule, or null for a one-off. A task never has both a due date and a recurrence.',
            oneOf: [{ $ref: '#/components/schemas/Recurrence' }, { type: 'null' }],
          },
          repeats: {
            type: ['string', 'null'],
            description: 'A short human summary of the recurrence (e.g. "every day", "Mon, Wed, Fri", "every 3 days"), or null for a one-off.',
          },
          createdAt: { type: 'string', format: 'date-time' },
          completedAt: { type: ['string', 'null'], format: 'date-time' },
        },
        required: ['id', 'title', 'done', 'due', 'recurrence', 'repeats', 'createdAt', 'completedAt'],
      },
      TaskInput: {
        type: 'object',
        description: 'A new task. Give a `due` day OR a `repeat`, never both; with neither, the task lands on today.',
        properties: {
          title: { type: 'string' },
          due: { type: ['string', 'null'], format: 'date', description: 'A future day (YYYY-MM-DD) for a one-off. Mutually exclusive with repeat.' },
          repeat: { $ref: '#/components/schemas/Repeat' },
        },
        required: ['title'],
      },
      TaskPatch: {
        type: 'object',
        description:
          'Any of the fields. Setting done to true stamps completedAt. Setting a `due` day clears any repeat, and setting a `repeat` clears the due day; pass due:null or repeat:null to clear either.',
        properties: {
          title: { type: 'string' },
          done: { type: 'boolean' },
          due: { type: ['string', 'null'], format: 'date' },
          repeat: { oneOf: [{ $ref: '#/components/schemas/Repeat' }, { type: 'null' }], description: 'A repeat to make the task recur, or null to stop it recurring.' },
        },
      },
      Repeat: {
        type: 'object',
        description: 'A repeat rule, in the same vocabulary the DoubleDone app and AI agent use. Mutually exclusive with due.',
        properties: {
          kind: { type: 'string', enum: ['daily', 'weekly', 'every_n_days', 'monthly'], description: 'How it repeats.' },
          weekdays: {
            type: 'array',
            items: { type: 'integer', minimum: 0, maximum: 6 },
            description: 'For weekly: the days, 0=Sun .. 6=Sat. Required and non-empty when kind is weekly.',
          },
          days: { type: 'integer', minimum: 1, description: 'For every_n_days: the interval in days. Required when kind is every_n_days.' },
          day: {
            type: 'integer',
            minimum: 1,
            maximum: 31,
            description:
              'For monthly: the day of the month, 1-31. Optional; defaults to the day the task is created on. A month with no such day uses its last day (the 31st is the 28th in February), so a monthly task is never skipped.',
          },
          start: { type: 'string', format: 'date', description: "Optional 'YYYY-MM-DD' the repeat begins; defaults to today." },
        },
        required: ['kind'],
      },
      Recurrence: {
        type: 'object',
        description:
          'The normalised repeat rule as stored and returned on a task (weekly carries its weekdays; an interval carries its day-count and anchor; monthly carries its day of the month).',
        properties: {
          kind: { type: 'string', enum: ['daily', 'weekly', 'interval', 'monthly'] },
          weekdays: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 }, description: 'For weekly: the days, 0=Sun .. 6=Sat.' },
          days: { type: 'integer', minimum: 1, description: 'For interval: the number of days between occurrences.' },
          day: { type: 'integer', minimum: 1, maximum: 31, description: 'For monthly: the day of the month, clamped to the last day of a month too short for it.' },
          start: { type: 'string', format: 'date', description: 'For daily/weekly/monthly: the day tracking begins.' },
          anchor: { type: 'string', format: 'date', description: 'For interval: the reference day the every-N-days cadence counts from.' },
        },
        required: ['kind'],
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
