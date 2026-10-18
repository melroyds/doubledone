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

const stepsCreated = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/StepsCreated' } } },
});

export const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'DoubleDone API',
    version: '1.3.0',
    description:
      'A small REST API over your DoubleDone tasks. Authenticate with your own DoubleDone token ' +
      '(in the app: Settings → AI agent access (MCP) → Copy my token), which scopes every call to your own data through ' +
      'row-level security. The server holds no elevated key. Tokens refresh about hourly. ' +
      'Tasks can repeat (daily, on chosen weekdays, every N days, or monthly on a day of the month); a repeat and a due date ' +
      'are mutually exclusive. A one-off can be tracked in parts (the app\'s "Track in steps"), counted with partsTotal and ' +
      'partsDone, and parts only go forward. A task can be broken into linked steps (the app\'s "Break it down"): the big ' +
      'task waits hidden behind them, and ticking the last step closes it. Listing supports search (q) and a look-ahead ' +
      'window (upcoming).',
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
          'precedence is q, then upcoming, then today, then the plain list: every task you have that is not deleted, ' +
          'open and finished, one-off and repeating, and those waiting on their steps (`hidden: true`) too.',
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
              'Look ahead this many days (clamped 1-30, default 7): your future-dated one-off tasks plus the next occurrence of each repeating task within the window. Each returned task carries the day it next lands in `due`. Takes precedence over today. Days are counted from the UTC calendar day.',
            schema: { type: 'integer', minimum: 1, maximum: 30, default: 7 },
          },
          {
            name: 'today',
            in: 'query',
            required: false,
            description: 'When true, only open, non-recurring tasks due today or undated (a decomposed-task umbrella the app hides is excluded). Today is the UTC calendar day for now (a timezone option is planned), so early in an Australian morning it can still be the previous day, and repeating tasks are not included here (the MCP list_today includes them).',
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
        description:
          'Creates a task. By default it lands on today. Optionally give it a `due` day OR a `repeat`, never both. A one-off can start tracked in parts (`partsTotal`, 2-50), with or without a `due` day; a repeating task cannot (400). ' +
          'With `steps` (2 to 20), the task is created together with its linked steps in one write: the big task waits hidden behind them, and ticking the last one closes it. The answer is then `{ task, steps }`. `steps` cannot come with `due`, `repeat` or `partsTotal` (400): give a step its own `due` instead.',
        operationId: 'createTask',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskInput' } } } },
        responses: {
          '201': {
            description: 'The created task, or, when `steps` were sent, the big task and its steps.',
            content: {
              'application/json': {
                // anyOf, never oneOf: a { task, steps } body matches BOTH branches (the first does not forbid extra
                // keys, and must not, because Task may grow), and oneOf demands exactly one, so every breakdown reply
                // failed a response validator and a strict generated client. api.test.ts compiles it with ajv.
                schema: {
                  anyOf: [
                    { type: 'object', properties: { task: { $ref: '#/components/schemas/Task' } }, required: ['task'] },
                    { $ref: '#/components/schemas/StepsCreated' },
                  ],
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/tasks/{id}/steps': {
      parameters: [{ name: 'id', in: 'path', required: true, description: 'The task to break down.', schema: { type: 'string' } }],
      post: {
        tags: ['tasks'],
        summary: 'Break a task into linked steps',
        description:
          'Breaks a task already on your list into 2 to 20 linked steps, as the app\'s Break it down does. The steps are created, then the task is hidden behind them (`hidden: true`); ticking the last step closes it, here, over MCP or in the app. ' +
          'A 409 if the task is done, repeats, is tracked in parts or is already waiting on its steps, or if it changed between our read and our write (then nothing is added). To undo a breakdown, delete all its steps, done ones too: the app brings the task back on its next open.',
        operationId: 'addSteps',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { steps: { type: 'array', minItems: 2, maxItems: 20, items: { $ref: '#/components/schemas/StepInput' } } },
                required: ['steps'],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          '201': stepsCreated('The task, now hidden behind its steps, and the steps in the order given.'),
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
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
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['tasks'],
        summary: 'Update a task',
        description:
          'Updates a task. Send any of title, done, due, repeat, partsTotal or partsDone, with at most one of done, partsTotal and partsDone. Setting a `due` day clears any repeat, and setting a `repeat` clears the due day; pass either as null to clear it. `done: true` on a REPEATING task ticks it for one day (the UTC day unless you pass `day`) and leaves the series open, so the returned task still shows done:false with its repeats summary; `done: false` un-ticks that day on the server only (a device that already synced the tick brings it back, ticks are kept on purpose). A one-off closes and reopens as you would expect, and closing one that is already done changes nothing. ' +
          'PARTS only go forward, because every device keeps the highest count it has seen: `partsDone` is absolute (lower than the current count is a 409, above partsTotal a 400, equal changes nothing), `done: true` on a task in parts fills every part, `done: false` on one is a 409, and `partsTotal` resizes (progress carries over, and a total at or below the parts done finishes it) or, as null, makes it one whole task again. ' +
          'A 409 means the task as it stands does not allow the change: a task in parts, waiting on its steps or a step cannot repeat; a repeating, done or waiting task cannot be tracked in parts; `done` on a task waiting on its steps is refused (tick its steps); or the task changed between our read and our write, so read it again. ' +
          'Closing a STEP (a task with a `parentId`) also closes its big task when that was the last open step, and the answer then lists it in `finished`. The big task is finished only when that is certain; anything else (a task made tiny, a single step) is left to the app, which sorts it out on its next open.',
        operationId: 'updateTask',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskPatch' } } } },
        responses: {
          '200': {
            description: 'The updated task, or the task as it stands when the change needed no write. When closing a step finished its big task, `finished` lists every task that closed with it, the topmost last.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { task: { $ref: '#/components/schemas/Task' }, finished: { type: 'array', items: { $ref: '#/components/schemas/Task' } } },
                  required: ['task'],
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
      delete: {
        tags: ['tasks'],
        summary: 'Delete a task',
        description:
          'A soft delete: the task is tombstoned, the same way the app removes one, so the removal syncs to your devices. A 204 even when no task matches (already removed, or never there), so a repeated delete is harmless. ' +
          'A task waiting on its steps (`hidden: true`) is a 409 whose `stepIds` lists every step it still has, done ones too. Delete ALL of them, and the app brings the task back on its next open, after which it deletes as any task does. Two or more done steps left behind would make the app mark it done instead, because every step it has left is done, and the message says so when that is the case. Deleting a step deletes that step alone.',
        operationId: 'deleteTask',
        responses: {
          '204': { description: 'Deleted (a soft delete; the row is tombstoned), or there was nothing to delete.' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '409': {
            description: 'The task is waiting on its steps (then `stepIds` is there), or it changed between our read and our write, so read it again before retrying.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    stepIds: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'For a task waiting on its steps: the id of every step it still has, done ones too. Delete all of them to bring it back.',
                    },
                  },
                  required: ['error'],
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Your DoubleDone token (Settings → AI agent access (MCP) → Copy my token). It is a Supabase access token, verified on every call, and it refreshes about hourly.',
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
          partsTotal: {
            type: ['integer', 'null'],
            minimum: 1,
            description: 'The number of parts the task is tracked in (the app\'s "Track in steps", e.g. 10 for a ten-episode series), or null for a whole task.',
          },
          partsDone: {
            type: ['integer', 'null'],
            minimum: 0,
            description: 'How many of those parts are ticked (0 to partsTotal), or null for a whole task. The task is done when every part is.',
          },
          parentId: {
            type: ['string', 'null'],
            description: 'For a step, the id of the big task it belongs to (ticking the last step closes it). null for any other task.',
          },
          parentTitle: {
            type: ['string', 'null'],
            description: "For a step, the big task's title as the step recorded it when it was made. It is not updated when the big task is renamed, and older steps may not carry it.",
          },
          hidden: {
            type: 'boolean',
            description: 'True while the task waits behind its steps (broken down, or made tiny in the app). Its steps close it, or bring it back. It is left out of the today, upcoming and search listings.',
          },
          createdAt: { type: 'string', format: 'date-time' },
          completedAt: { type: ['string', 'null'], format: 'date-time' },
        },
        required: ['id', 'title', 'done', 'due', 'recurrence', 'repeats', 'partsTotal', 'partsDone', 'parentId', 'parentTitle', 'hidden', 'createdAt', 'completedAt'],
      },
      TaskInput: {
        type: 'object',
        description: 'A new task. Give a `due` day OR a `repeat`, never both; with neither, the task lands on today. Or give `steps` to create it broken down.',
        properties: {
          title: { type: 'string', description: 'The task. With `steps`, at most 500 characters.' },
          due: {
            type: ['string', 'null'],
            format: 'date',
            description:
              'The day (YYYY-MM-DD) a one-off is due. A later day schedules it; today or an earlier day puts it on today, as in the app. Only its shape is checked, so send a real calendar day. Mutually exclusive with repeat.',
          },
          repeat: { $ref: '#/components/schemas/Repeat' },
          partsTotal: {
            type: 'integer',
            minimum: 2,
            maximum: 50,
            description: 'Track the new one-off in this many parts, starting at none done. Not with repeat.',
          },
          steps: {
            type: 'array',
            minItems: 2,
            maxItems: 20,
            items: { $ref: '#/components/schemas/StepInput' },
            description: 'Create the task broken into these linked steps, in order. Not with due, repeat or partsTotal.',
          },
        },
        required: ['title'],
      },
      StepInput: {
        type: 'object',
        description: 'One linked step. A leading list marker ("• ", "- ", "1. ") and a trailing "(5 min)" are tidied off the title; the minutes are written back as "(5 min)".',
        properties: {
          title: { type: 'string', maxLength: 500, description: 'The step, e.g. "Bag up the rubbish".' },
          minutes: { type: 'integer', minimum: 1, maximum: 480, description: 'An estimate in minutes. Optional.' },
          due: { type: 'string', format: 'date', description: 'A day (YYYY-MM-DD) for a step on a later day. Without it the step is on today.' },
        },
        required: ['title'],
        additionalProperties: false,
      },
      StepsCreated: {
        type: 'object',
        description: 'A breakdown as written: the big task (hidden: true) and its steps, in order.',
        properties: {
          task: { $ref: '#/components/schemas/Task' },
          steps: { type: 'array', items: { $ref: '#/components/schemas/Task' } },
        },
        required: ['task', 'steps'],
      },
      TaskPatch: {
        type: 'object',
        description:
          'Any of the fields, with at most one of done, partsTotal and partsDone. On a one-off, done:true stamps completedAt and done:false clears it. On a REPEATING task, done ticks or un-ticks ONE day (`day`, default the UTC day) and never closes the series. On a task in parts, done:true fills every part and done:false is refused. Setting a `due` day clears any repeat, and setting a `repeat` clears the due day; pass due:null or repeat:null to clear either.',
        properties: {
          title: { type: 'string' },
          done: { type: 'boolean' },
          day: { type: 'string', description: "With done on a repeating task: the calendar day to tick or un-tick ('YYYY-MM-DD', the user's local date). Defaults to the UTC day." },
          due: { type: ['string', 'null'], format: 'date' },
          repeat: { oneOf: [{ $ref: '#/components/schemas/Repeat' }, { type: 'null' }], description: 'A repeat to make the task recur, or null to stop it recurring.' },
          partsTotal: {
            type: ['integer', 'null'],
            minimum: 2,
            maximum: 50,
            description: 'Track the task in this many parts. Progress carries over, and a total at or below the parts already done finishes it. null makes it one whole task again. Not with a repeat.',
          },
          partsDone: {
            type: 'integer',
            minimum: 0,
            maximum: 50,
            description: 'How many parts are ticked, ABSOLUTE and forward-only: lower than the current count is a 409, above partsTotal a 400, the same count changes nothing. Reaching partsTotal finishes the task.',
          },
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
      Unauthorized: { description: 'Missing, expired, forged or otherwise invalid token. The token is verified before any call, so re-copy it from the app.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound: { description: 'No such task.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Conflict: {
        description: 'The task as it stands does not allow this change (for example, lowering partsDone, a repeat on a task in parts, or steps for a task already done), or it changed between our read and our write. The message says which. Read the task again before retrying.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      InternalError: { description: 'Something went wrong on our side (always JSON, always with CORS). Retry in a moment.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
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
