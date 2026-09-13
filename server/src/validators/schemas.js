import Joi from 'joi';

export const registerSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('admin', 'faculty', 'student', 'hod').required(),
  rollNo: Joi.string().allow('').when('role', { is: 'student', then: Joi.string().required() }),
  employeeId: Joi.string().allow('').when('role', { is: 'student', then: Joi.optional(), otherwise: Joi.optional() }),
  department: Joi.string().allow(''),
  cohort: Joi.string().allow(''),
  consentGiven: Joi.boolean(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const courseSchema = Joi.object({
  code: Joi.string().required(),
  title: Joi.string().required(),
  department: Joi.string().allow(''),
  semester: Joi.number().min(1).max(8),
  courseType: Joi.string().valid('theory', 'PCC', 'PCCL', 'IPCC', 'AEC').default('PCC'),
  aecType: Joi.string().valid('theory', 'practical').default('theory'),
  hasPractical: Joi.boolean().default(false),
  componentsActive: Joi.object({
    theory: Joi.boolean(), practical: Joi.boolean(), assessment: Joi.boolean(), see: Joi.boolean(),
  }).unknown(true),
  assessmentPlan: Joi.array().items(Joi.object({
    method: Joi.string().required(),
    cos: Joi.array().items(Joi.string().valid('CO1', 'CO2', 'CO3', 'CO4', 'CO5')),
    maxMarks: Joi.number().min(0),
  })),
  cohorts: Joi.array().items(Joi.string()).default([]),
  cos: Joi.array().items(Joi.object({
    coId: Joi.string().valid('CO1', 'CO2', 'CO3', 'CO4', 'CO5').required(),
    description: Joi.string().required(),
    maxRbtl: Joi.string().valid('L1', 'L2', 'L3', 'L4', 'L5', 'L6'),
  })).min(1).max(5).required(),
  coPoMatrix: Joi.array().items(Joi.object({
    coId: Joi.string().required(),
    weights: Joi.object().pattern(/.*/, Joi.number().min(0).max(3)),
  })),
  examSchemes: Joi.array().items(Joi.object({
    examType: Joi.string().required(),
    kind: Joi.string().valid('equal_per_module', 'per_co', 'flexible').required(),
    moduleCount: Joi.number().min(1).max(12),
    totalMarks: Joi.number().min(1),
    slots: Joi.array().items(Joi.object({
      co: Joi.string().valid('CO1', 'CO2', 'CO3', 'CO4', 'CO5').required(),
      marks: Joi.number().min(1).required(),
    })),
  })),
  enforceModuleCoMapping: Joi.boolean(),
  moduleCoMap: Joi.array().items(Joi.object({
    moduleNo: Joi.number().min(1).required(),
    cos: Joi.array().items(Joi.string().valid('CO1', 'CO2', 'CO3', 'CO4', 'CO5')),
  })),
});

export const examSchema = Joi.object({
  courseId: Joi.string().required(),
  cohorts: Joi.array().items(Joi.string()).min(1).required()
    .messages({ 'array.min': 'Select at least one cohort (batch) for this exam.', 'any.required': 'Select at least one cohort (batch) for this exam.' }),
  title: Joi.string().required(),
  subjectCode: Joi.string().required(),
  examType: Joi.string().valid('CIE 1', 'CIE 2', 'CIE 3', 'SEE', 'Model', 'Supplementary').required(),
  examDate: Joi.date().required(),
  startTime: Joi.date().required(),
  durationMins: Joi.number().min(15).required(),
  gracePeriodMins: Joi.number().min(0).default(10),
  allowEarlySubmit: Joi.boolean().default(true),
  maxMarks: Joi.number().min(1).required(),
  venue: Joi.string().allow(''),
});

// All fields optional — used for editing an existing exam's schedule/metadata
export const examUpdateSchema = Joi.object({
  title: Joi.string(),
  subjectCode: Joi.string(),
  examType: Joi.string().valid('CIE 1', 'CIE 2', 'CIE 3', 'SEE', 'Model', 'Supplementary'),
  examDate: Joi.date(),
  startTime: Joi.date(),
  durationMins: Joi.number().min(15),
  gracePeriodMins: Joi.number().min(0),
  allowEarlySubmit: Joi.boolean(),
  maxMarks: Joi.number().min(1),
  venue: Joi.string().allow(''),
  cohorts: Joi.array().items(Joi.string()),
}).min(1);

const testCase = Joi.object({
  stdin: Joi.string().allow(''),
  expectedStdout: Joi.string().allow(''),
  hidden: Joi.boolean(),
  weight: Joi.number().min(0),
});

const subQuestion = Joi.object({
  label: Joi.string().required(),
  text: Joi.string().required(),
  co: Joi.string().valid('CO1', 'CO2', 'CO3', 'CO4', 'CO5', '').allow('').default(''),
  additionalCos: Joi.array().items(Joi.string().valid('CO1', 'CO2', 'CO3', 'CO4', 'CO5')).default([]),
  rbtl: Joi.string().valid('L1', 'L2', 'L3', 'L4', 'L5', 'L6', '').allow('').default(''),
  marks: Joi.number().min(1).required(),
  expectedLength: Joi.string().valid('brief', 'short', 'medium', 'long'),
  imageFileId: Joi.string().allow('', null),
  questionType: Joi.string().valid('descriptive', 'programming').default('descriptive'),
  // Programming fields — required only when questionType is 'programming'.
  language: Joi.string().valid('python', 'java', 'c', 'cpp')
    .when('questionType', { is: 'programming', then: Joi.required() }),
  starterCode: Joi.string().allow('').optional(),
  testCases: Joi.array().items(testCase)
    .when('questionType', { is: 'programming', then: Joi.array().min(1).required() }),
  timeLimitSec: Joi.number().min(1).max(15),
  memoryLimitMb: Joi.number().min(16).max(512),
  rubric: Joi.object({
    correctness: Joi.number().min(0).max(100),
    style: Joi.number().min(0).max(100),
    complexity: Joi.number().min(0).max(100),
  }).custom((v, helpers) => {
    const sum = (v.correctness || 0) + (v.style || 0) + (v.complexity || 0);
    if (Math.round(sum) !== 100) return helpers.error('any.invalid');
    return v;
  }, 'rubric sums to 100').optional(),
  complexityThreshold: Joi.number().min(1),
});

export const questionPaperSchema = Joi.object({
  groups: Joi.array().items(Joi.object({
    groupType: Joi.string().valid('solo', 'or_pair').required(),
    questions: Joi.array().items(Joi.object({
      questionNo: Joi.number().required(),
      moduleNo: Joi.number().min(1),
      instruction: Joi.string().allow(''),
      subQuestions: Joi.array().items(subQuestion).min(1).required(),
    })).min(1).required(),
  })).min(1).required(),
});

export const schemeSchema = Joi.object({
  published: Joi.boolean(),
  entries: Joi.array().items(Joi.object({
    groupIndex: Joi.number().required(),
    questionNo: Joi.number().required(),
    subLabel: Joi.string().required(),
    co: Joi.string().allow('').default(''),
    additionalCos: Joi.array().items(Joi.string().valid('CO1', 'CO2', 'CO3', 'CO4', 'CO5')).default([]),
    rbtl: Joi.string().allow('').default(''),
    maxMarks: Joi.number().required(),
    questionType: Joi.string().valid('descriptive', 'programming').default('descriptive'),
    // Programming questions are scored from their test cases (on the paper), so
    // a model answer, keywords and NLP weights are not required for them.
    modelAnswer: Joi.string().allow('').when('questionType', { is: 'programming', then: Joi.optional(), otherwise: Joi.required() }),
    mandatoryKeywords: Joi.array().items(Joi.string()),
    bonusKeywords: Joi.array().items(Joi.string()),
    weights: Joi.object({
      cosine: Joi.number().required(), keywords: Joi.number().required(),
      style: Joi.number().required(), grammar: Joi.number().required(),
    }).when('questionType', { is: 'programming', then: Joi.optional(), otherwise: Joi.required() }),
  })).required(),
});

const answer = Joi.object({
  groupIndex: Joi.number().required(),
  questionNo: Joi.number().required(),
  subLabel: Joi.string().required(),
  inputMode: Joi.string().valid('typed', 'scanned'),
  rawText: Joi.string().allow(''),
  scanFileId: Joi.string(),
  ocrText: Joi.string().allow(''),
});

export const saveAnswersSchema = Joi.object({
  examId: Joi.string(),
  answers: Joi.array().items(answer).required(),
});

export const submitSchema = Joi.object({
  examId: Joi.string(),
  answers: Joi.array().items(answer),
  submitMode: Joi.string().valid('manual', 'auto_timeout'),
});

export const reviewSchema = Joi.object({
  questionNo: Joi.number().required(),
  subLabel: Joi.string().required(),
  action: Joi.string().valid('accept', 'adjust', 'flag').required(),
  newScore: Joi.number(),
  reason: Joi.string().allow(''),
});

export const orSelectSchema = Joi.object({
  groupIndex: Joi.number().required(),
  selectedQuestionNo: Joi.number().required(),
  reason: Joi.string().required(),
});

export const appealSchema = Joi.object({
  examId: Joi.string().required(),
  questionNo: Joi.number().required(),
  subLabel: Joi.string().required(),
  grounds: Joi.string().required(),
  explanation: Joi.string().min(20).required(),
});

export const resolveAppealSchema = Joi.object({
  outcome: Joi.string().valid('upheld', 'revised').required(),
  revisedScore: Joi.number(),
  reason: Joi.string().required(),
});
