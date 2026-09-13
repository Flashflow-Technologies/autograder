/**
 * Seed content extracted from the institution's
 * "Vision-Mission-PEO-PSO-PO-AcademicObjectives" document, so the admin doesn't
 * have to type these every time. Applied via POST /admin/institute/seed and
 * /admin/departments/:id/seed-vm (non-destructive: only fills empty fields
 * unless ?overwrite=true).
 *
 * PO/PSO statement TEXT is keyed to the stable identifiers (PO1.. / PSO1..) so
 * attainment maths is unaffected. WK, PEO and Academic Objectives are free lists.
 */

export const INSTITUTE_SEED = {
  vision: [
    { text: 'To be an Engineering Institute of highest repute and produce world-class engineers catering to the needs of mankind.', order: 0 },
  ],
  mission: [
    { text: 'Provide the right environment to develop quality education for all, irrespective of caste, creed or religion to produce future leaders.', order: 0 },
    { text: 'Create opportunities for pursuit of knowledge and all-round development.', order: 1 },
    { text: 'Impart value education to students to build sense of integrity, honesty and ethics.', order: 2 },
  ],
};

// Department-level: Vision/Mission + the program's PO/PSO/PEO/WK/Academic
// Objectives (the document's CSD department content). PO/PSO are keyed to stable
// identifiers; text only.
export const DEPARTMENT_SEED = {
  vision: [
    { text: 'To be a globally competent center in Computer Science and Design committed to produce a pool of knowledgeable engineers to extend solutions for the mankind.', order: 0 },
  ],
  mission: [
    { text: 'Provide the environment to become industry ready Professionals, Researchers and Entrepreneurs by offering emerging courses.', order: 0 },
    { text: 'Imparting experiential learning to gain proficiency in contemporary software and design tools to meet the current demands of the industries.', order: 1 },
    { text: 'Develop teamwork and problem-solving abilities, foster lifelong learning and instill sense of ethical and societal responsibility among students.', order: 2 },
  ],
  programOutcomes: [
    { key: 'PO1', statement: 'Engineering knowledge: Apply knowledge of mathematics, natural science, computing, engineering fundamentals and an engineering specialization as specified in WK1 to WK4 respectively to develop to the solution of complex engineering problems.' },
    { key: 'PO2', statement: 'Problem Analysis: Identify, formulate, review research literature and analyze complex engineering problems reaching substantiated conclusions with consideration for sustainable development. (WK1 to WK4)' },
    { key: 'PO3', statement: 'Design/Development of solutions: Design creative solutions for complex engineering problems and design/develop systems/components/processes to meet identified needs with consideration for the public health and safety, whole-life cost, net zero carbon, culture, society and environment as required. (WK5)' },
    { key: 'PO4', statement: 'Conduct investigations of complex problems: Conduct investigations of complex engineering problems using research-based knowledge including design of experiments, modelling, analysis & interpretation of data to provide valid conclusions. (WK8)' },
    { key: 'PO5', statement: 'Engineering tool usage: Create, select and apply appropriate techniques, resources and modern engineering & IT tools, including prediction and modelling recognizing their limitations to solve complex engineering problems. (WK2 and WK6)' },
    { key: 'PO6', statement: 'The Engineer and The World: Analyze and evaluate societal and environmental aspects while solving complex engineering problems for its impact on sustainability with reference to economy, health, safety, legal framework, culture and environment. (WK1, WK5, and WK7)' },
    { key: 'PO7', statement: 'Ethics: Apply ethical principles and commit to professional ethics, human values, diversity and inclusion; adhere to national & international laws. (WK9)' },
    { key: 'PO8', statement: 'Individual and Collaborative team work: Function effectively as an individual, and as a member or leader in diverse/multi-disciplinary teams.' },
    { key: 'PO9', statement: 'Communication: Communicate effectively and inclusively within the engineering community and society at large, such as being able to comprehend and write effective reports and design documentation, make effective presentations considering cultural, language, and learning differences.' },
    { key: 'PO10', statement: 'Project management and finance: Apply knowledge and understanding of engineering management principles and economic decision-making and apply these to one\u2019s own work, as a member and leader in a team, and to manage projects and in multidisciplinary environments.' },
    { key: 'PO11', statement: 'Life-long learning: Recognize the need for, and have the preparation and ability for i) independent and life-long learning ii) adaptability to new and emerging technologies and iii) critical thinking in the broadest context of technological change. (WK8)' },
  ],
  programSpecificOutcomes: [
    { key: 'PSO1', statement: 'Demonstrate application-oriented learning in full stack software development by applying computer science and design principles to develop robust, user-centric applications.' },
    { key: 'PSO2', statement: 'Apply experiential learning to design and develop innovative computer-based systems in Multimedia, Graphics, and User Interface domains using modern software tools and industry practices.' },
  ],
  peos: [
    { text: 'Exhibit the knowledge and skill sets to acclimatize to the significant technical innovations and modifications in the field of computer science and design.', order: 0 },
    { text: 'Become accustomed to a corporate work atmosphere, carrying out assigned tasks with competence, and being able to keep up with new technology developments to launch start-ups and research.', order: 1 },
    { text: 'Engage in inventive work to capitalize on novel ideas for enhancing socio-economical values of the mankind.', order: 2 },
  ],
  wks: [
    { text: 'WK1: A systematic, theory-based understanding of the natural sciences applicable to the discipline and awareness of relevant social sciences.', order: 0 },
    { text: 'WK2: Conceptually-based mathematics, numerical analysis, data analysis, statistics and formal aspects of computer and information science to support detailed analysis and modelling applicable to the discipline.', order: 1 },
    { text: 'WK3: A systematic, theory-based formulation of engineering fundamentals required in the engineering discipline.', order: 2 },
    { text: 'WK4: Engineering specialist knowledge that provides theoretical frameworks and bodies of knowledge for the accepted practice areas in the engineering discipline; much is at the forefront of the discipline.', order: 3 },
    { text: 'WK5: Knowledge, including efficient resource use, environmental impacts, whole-life cost, re-use of resources, net zero carbon, and similar concepts, that supports engineering design and operations in a practice area.', order: 4 },
    { text: 'WK6: Knowledge of engineering practice (technology) in the practice areas in the engineering discipline.', order: 5 },
    { text: 'WK7: Knowledge of the role of engineering in society and identified issues in engineering practice in the discipline, such as the professional responsibility of an engineer to public safety and sustainable development.', order: 6 },
    { text: 'WK8: Engagement with selected knowledge in the current research literature of the discipline, awareness of the power of critical thinking and creative approaches to evaluate emerging issues.', order: 7 },
    { text: 'WK9: Ethics, inclusive behavior and conduct. Knowledge of professional ethics, responsibilities, and norms of engineering practice. Awareness of the need for diversity by reason of ethnicity, gender, age, physical ability etc. with mutual understanding and respect, and of inclusive attitudes.', order: 8 },
  ],
  academicObjectives: [
    { text: 'To ensure that at least 80% of the students complete internships through industry collaboration or in-house projects during their course of study, thereby strengthening practical exposure and professional readiness.', order: 0 },
    { text: 'To organize a minimum of 5 structured upskilling programs within the department each academic year and ensure that at least 80% of students complete 2 or more NPTEL or equivalent certification courses to enhance their technical and design competencies.', order: 1 },
    { text: 'To promote quality research and socially relevant innovation by initiating a minimum of 3 research or development projects annually aligned with one or more Sustainable Development Goals, and to publish at least 5 high-quality research papers per year in peer-reviewed journals or conferences.', order: 2 },
  ],
};
