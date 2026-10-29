// src/constants/courseData.js

// Methana thama okkoma Course wisthara thiyenne.
// Oyata ona welawaka me tika wenas karanna puluwan.

export const COURSES = [
  {
    id: 1,
    title: 'O/L ICT - Grade 11',
    teacher: 'Chamindu',
    image: require('../assets/2.png'), // Oyage image eka methanata link karanna
    description: 'Complete O/L ICT Syllabus with Theory & Revision.',
    batches: [
      { id: '2025_JULY', name: '2025 July Batch' },
      { id: '2025_PAPER', name: '2025 Paper Class' }
    ],
    subjects: [
      { id: 'SUB1', name: 'Sinhala', price: 7200 },
      { id: 'SUB2', name: 'English', price: 7200 },
      { id: 'SUB3', name: 'History', price: 7200 },
      { id: 'SUB4', name: 'Science', price: 7200 },
      { id: 'SUB5', name: 'Budhism', price: 7200 },
    ]
  },
  {
    id: 2,
    title: 'A/L ICT - 2025',
    teacher: 'Mr. Perera',
    image: require('../assets/1.png'),
    description: 'Advanced Level ICT covering Programming & Networking.',
    batches: [
      { id: '2025_Art', name: '2025 Art Stream' },
      { id: '2025_Commerce', name: '2025 Commerce Stream' },

    ],
    subjects: [
      { id: 'SUB1', name: 'A/L Theory', price: 2500 },
      { id: 'SUB2', name: 'Programming Lab', price: 1500 }
    ]
  },
  // Thawa courses ona nam methana copy-paste karala danna
];