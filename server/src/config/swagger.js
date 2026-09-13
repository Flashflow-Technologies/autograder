import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EvalAI — OBE Exam Evaluation System API',
      version: '1.0.0',
      description:
        'Automated, OBE-compliant exam evaluation system (MERN). Covers exam scheduling, ' +
        'question papers with OR equivalence, marking schemes, time-gated submission, ' +
        'NLP scoring, human-in-the-loop review, CO/PO attainment, and student results.',
    },
    servers: [{ url: '/api', description: 'API root' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                details: { type: 'array', items: { type: 'string' }, nullable: true },
              },
            },
          },
        },
        Credentials: {
          type: 'object',
          required: ['email', 'password'],
          properties: { email: { type: 'string' }, password: { type: 'string' } },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication and user management' },
      { name: 'Courses', description: 'Courses, COs and CO-PO-PSO matrix' },
      { name: 'Exams', description: 'Exam scheduling, question papers and schemes' },
      { name: 'Submissions', description: 'Time-gated student answer submission' },
      { name: 'Scoring', description: 'NLP scoring orchestration' },
      { name: 'Review', description: 'Human-in-the-loop faculty review' },
      { name: 'Attainment', description: 'CO/PO attainment and reports' },
      { name: 'Results', description: 'Student results, feedback and appeals' },
    ],
  },
  // Pull JSDoc @swagger blocks from all route files
  apis: ['./src/routes/*.js'],
};

export const swaggerSpec = swaggerJsdoc(options);
