import type { DemoLanguage } from '../demo/highlight';

/**
 * The lessons behind the Learn page.
 *
 * Every lesson states a goal, gives the smallest piece of theory that makes
 * the goal reachable, and then checks the learner's own code. Nothing here is
 * multiple choice: the only way past a lesson is to write something that
 * works, which is the only thing that transfers.
 *
 * All lesson text is English, deliberately, so that a learner is reading the
 * same words they will meet in error messages, documentation and search
 * results for the rest of their career.
 */

/** How a lesson decides whether the learner solved it. */
export type CheckKind = 'run' | 'read';

export interface RunTest {
  /** A call expression evaluated after the learner's code has run. */
  call: string;
  /** The value the call has to produce. */
  expected: unknown;
  /** Shown when this case fails, phrased as a hint rather than an answer. */
  hint: string;
}

export interface ReadTest {
  /** Must appear in the learner's code for the lesson to pass. */
  pattern: string;
  /** Human description of what the pattern is looking for. */
  describe: string;
  /** Shown when the pattern is missing. */
  hint: string;
  /** When true the pattern must NOT appear. */
  forbidden?: boolean;
}

export interface Lesson {
  id: string;
  title: string;
  /** One sentence on what the learner will be able to do afterwards. */
  goal: string;
  /** The theory, in short paragraphs. */
  teach: string[];
  /** The task, phrased as an instruction. */
  task: string;
  /** What the editor starts with. */
  starter: string;
  /** A worked solution, revealed only on request. */
  solution: string;
  check: CheckKind;
  run?: RunTest[];
  read?: ReadTest[];
}

export interface Track {
  id: DemoLanguage;
  name: string;
  badge: string;
  colour: string;
  darkText?: boolean;
  /** Who the track is for, in one line. */
  blurb: string;
  /** How the checker works, stated plainly on the page. */
  checking: string;
  lessons: Lesson[];
}

/* -------------------------------------------------------------------------- */
/* Python                                                                      */
/* -------------------------------------------------------------------------- */

const PYTHON_LESSONS: Lesson[] = [
  {
    id: 'py-print',
    title: 'Printing',
    goal: 'Make the computer say something back.',
    teach: [
      'A program is a list of instructions. The computer runs them from the top down, one at a time, and does exactly what each one says.',
      'print() is an instruction that puts text on the screen. The text goes inside the brackets, wrapped in quotes so Python knows where it starts and ends.'
    ],
    task: 'Print the line: Hello, world!',
    starter: '# Write your code below\n',
    solution: 'print("Hello, world!")\n',
    check: 'read',
    read: [
      {
        pattern: 'print\\s*\\(',
        describe: 'a call to print',
        hint: 'Start the line with print( and close the bracket at the end.'
      },
      {
        pattern: 'Hello,\\s*world!',
        describe: 'the text Hello, world!',
        hint: 'The text has to match exactly, including the comma and the exclamation mark.'
      }
    ]
  },
  {
    id: 'py-variables',
    title: 'Variables',
    goal: 'Store a value and use it again later.',
    teach: [
      'A variable is a name for a value. You write the name, an equals sign, and the value. From then on the name stands for that value.',
      'The equals sign here does not mean "is equal to". It means "put this value into this name", which is why it is called assignment.'
    ],
    task: 'Create a variable called language holding the text Python, then print it.',
    starter: '# Create the variable, then print it\n',
    solution: 'language = "Python"\nprint(language)\n',
    check: 'read',
    read: [
      {
        pattern: 'language\\s*=',
        describe: 'a variable called language',
        hint: 'Write the name first, then =, then the value: language = "Python"'
      },
      {
        pattern: 'print\\s*\\(\\s*language\\s*\\)',
        describe: 'printing the variable',
        hint: 'Pass the name, not the text: print(language), with no quotes around language.'
      }
    ]
  },
  {
    id: 'py-conditions',
    title: 'Making a decision',
    goal: 'Run one piece of code or another, depending on a value.',
    teach: [
      'if runs the indented block underneath it only when its condition is true. else covers every other case.',
      'Indentation is not decoration in Python. The spaces at the start of a line are how the language knows which lines belong to the if, so they have to be consistent.'
    ],
    task: 'Given the variable age, print "adult" when it is 18 or more, and "minor" otherwise.',
    starter: 'age = 21\n\n# Decide what to print\n',
    solution: 'age = 21\n\nif age >= 18:\n    print("adult")\nelse:\n    print("minor")\n',
    check: 'read',
    read: [
      {
        pattern: 'if\\s+age\\s*>=\\s*18\\s*:',
        describe: 'the condition',
        hint: 'Write if age >= 18: and end the line with a colon.'
      },
      { pattern: 'else\\s*:', describe: 'the else branch', hint: 'Add else: on its own line, then indent the line below it.' },
      { pattern: 'adult', describe: 'the word adult', hint: 'Print the text adult when the condition is true.' },
      { pattern: 'minor', describe: 'the word minor', hint: 'Print the text minor in the else branch.' }
    ]
  },
  {
    id: 'py-loops',
    title: 'Repeating yourself',
    goal: 'Do the same thing for every item in a list.',
    teach: [
      'A for loop takes each item in turn and runs its block once per item. The name between for and in is yours to choose; it holds one item at a time.',
      'range(1, 6) produces the numbers 1 to 5. The first number is included and the last one is not, which trips up everyone exactly once.'
    ],
    task: 'Print the numbers 1 to 5, one per line.',
    starter: '# Loop from 1 to 5\n',
    solution: 'for number in range(1, 6):\n    print(number)\n',
    check: 'read',
    read: [
      { pattern: 'for\\s+\\w+\\s+in\\s+', describe: 'a for loop', hint: 'Start with for, then a name, then in, then what to loop over.' },
      { pattern: 'range\\s*\\(\\s*1\\s*,\\s*6\\s*\\)', describe: 'the range', hint: 'range(1, 6) gives 1 to 5, because the end is not included.' },
      { pattern: 'print\\s*\\(', describe: 'printing inside the loop', hint: 'Indent the print so it belongs to the loop.' }
    ]
  },
  {
    id: 'py-functions',
    title: 'Functions',
    goal: 'Give a piece of work a name so you can reuse it.',
    teach: [
      'def creates a function: a named block you can run whenever you like. The names in the brackets are its inputs, and the caller supplies the values.',
      'return hands a value back to whoever called the function. A function without return still runs, but it gives back nothing, which is a common first bug.'
    ],
    task: 'Write a function called double that takes a number and returns twice that number.',
    starter: '# Define the function\n',
    solution: 'def double(number):\n    return number * 2\n',
    check: 'read',
    read: [
      { pattern: 'def\\s+double\\s*\\(\\s*\\w+\\s*\\)\\s*:', describe: 'the function definition', hint: 'Write def double(number): with one input name in the brackets.' },
      { pattern: 'return\\b', describe: 'a return statement', hint: 'Use return to hand the value back. print shows it, return gives it.' },
      { pattern: '\\*\\s*2|2\\s*\\*', describe: 'multiplying by two', hint: 'Multiply the input by 2 with the * operator.' }
    ]
  },
  {
    id: 'py-lists',
    title: 'Lists',
    goal: 'Hold many values in one place and work through them.',
    teach: [
      'A list holds values in order, written inside square brackets and separated by commas. It can grow and shrink while the program runs.',
      'You reach one item by its position, starting at 0. prices[0] is the first. Counting from zero is the convention in almost every language, so it is worth getting used to now.'
    ],
    task: 'Make a list called prices holding 10, 20 and 30, then print the total using sum().',
    starter: '# Build the list, then print the total\n',
    solution: 'prices = [10, 20, 30]\nprint(sum(prices))\n',
    check: 'read',
    read: [
      { pattern: 'prices\\s*=\\s*\\[', describe: 'a list called prices', hint: 'Use square brackets: prices = [10, 20, 30]' },
      { pattern: '10\\s*,\\s*20\\s*,\\s*30', describe: 'the three values', hint: 'Separate the values with commas, in that order.' },
      { pattern: 'sum\\s*\\(\\s*prices\\s*\\)', describe: 'the total', hint: 'sum(prices) adds every item in the list for you.' }
    ]
  }
];

/* -------------------------------------------------------------------------- */
/* JavaScript                                                                  */
/* -------------------------------------------------------------------------- */

const JAVASCRIPT_LESSONS: Lesson[] = [
  {
    id: 'js-function',
    title: 'Your first function',
    goal: 'Write a function that gives a value back.',
    teach: [
      'A function is a named piece of work. It takes inputs in the brackets and hands a value back with return.',
      'Nothing happens when you define a function. It runs only when something calls it, which is what the checker below does.'
    ],
    task: 'Write a function called add that takes two numbers and returns their sum.',
    starter: 'function add(a, b) {\n  // return the sum\n}\n',
    solution: 'function add(a, b) {\n  return a + b;\n}\n',
    check: 'run',
    run: [
      { call: 'add(2, 3)', expected: 5, hint: 'add(2, 3) should give 5. Make sure you use return, not console.log.' },
      { call: 'add(-4, 4)', expected: 0, hint: 'Negative numbers have to work too, which they will if you simply add the two inputs.' }
    ]
  },
  {
    id: 'js-conditions',
    title: 'Choosing an answer',
    goal: 'Return different values depending on the input.',
    teach: [
      'if runs its block when the condition is true. Put the condition in brackets and the block in braces.',
      'Use === to compare, not ==. The double equals converts its operands first, which is where "0 equals empty string" comes from.'
    ],
    task: 'Write grade(score) returning "pass" when score is 50 or more, and "fail" otherwise.',
    starter: 'function grade(score) {\n  // return "pass" or "fail"\n}\n',
    solution: 'function grade(score) {\n  if (score >= 50) {\n    return "pass";\n  }\n  return "fail";\n}\n',
    check: 'run',
    run: [
      { call: 'grade(80)', expected: 'pass', hint: 'A score of 80 is a pass.' },
      { call: 'grade(50)', expected: 'pass', hint: 'The boundary counts: 50 passes, because the task says 50 or more.' },
      { call: 'grade(49)', expected: 'fail', hint: '49 is below the boundary, so it fails.' }
    ]
  },
  {
    id: 'js-loops',
    title: 'Working through a list',
    goal: 'Visit every item and build up a result.',
    teach: [
      'An array holds values in order, written in square brackets. A for...of loop hands you one item at a time.',
      'Keep a running total in a variable declared before the loop. Declare it with let, because it changes; use const for anything that does not.'
    ],
    task: 'Write total(numbers) returning the sum of every number in the array.',
    starter: 'function total(numbers) {\n  // add them all up\n}\n',
    solution: 'function total(numbers) {\n  let sum = 0;\n  for (const number of numbers) {\n    sum += number;\n  }\n  return sum;\n}\n',
    check: 'run',
    run: [
      { call: 'total([1, 2, 3])', expected: 6, hint: '1 + 2 + 3 is 6.' },
      { call: 'total([])', expected: 0, hint: 'An empty array has a total of 0, which works if you start your running total at 0.' },
      { call: 'total([10, -10, 5])', expected: 5, hint: 'Every item counts, including negative ones.' }
    ]
  },
  {
    id: 'js-strings',
    title: 'Working with text',
    goal: 'Build a piece of text out of values.',
    teach: [
      'Text is a string. You can join strings with +, or write a template literal in backticks and drop values in with ${...}.',
      'A template literal is usually easier to read, because the shape of the finished text is visible in the source.'
    ],
    task: 'Write greet(name) returning "Hello, " followed by the name and an exclamation mark.',
    starter: 'function greet(name) {\n  // return the greeting\n}\n',
    solution: 'function greet(name) {\n  return `Hello, ${name}!`;\n}\n',
    check: 'run',
    run: [
      { call: 'greet("Ada")', expected: 'Hello, Ada!', hint: 'The result for "Ada" is exactly: Hello, Ada!' },
      { call: 'greet("")', expected: 'Hello, !', hint: 'An empty name still produces the rest of the sentence.' }
    ]
  },
  {
    id: 'js-objects',
    title: 'Objects',
    goal: 'Group related values under one name.',
    teach: [
      'An object holds named values, written as key: value pairs inside braces. You reach one with a dot: user.name.',
      'Where an array answers "which position", an object answers "which name", and names survive reordering.'
    ],
    task: 'Write describe(user) returning the name followed by their age in brackets, as in: Ada (36)',
    starter: 'function describe(user) {\n  // user has .name and .age\n}\n',
    solution: 'function describe(user) {\n  return `${user.name} (${user.age})`;\n}\n',
    check: 'run',
    run: [
      { call: 'describe({ name: "Ada", age: 36 })', expected: 'Ada (36)', hint: 'The shape is name, a space, then the age in round brackets.' },
      { call: 'describe({ name: "Grace", age: 45 })', expected: 'Grace (45)', hint: 'It has to work for any user, so read the values off the object rather than writing them out.' }
    ]
  },
  {
    id: 'js-filter',
    title: 'Selecting items',
    goal: 'Keep only the items that match a rule.',
    teach: [
      'filter builds a new array from the items a test keeps. The test is a small function that returns true or false for one item.',
      'The original array is untouched. Methods that return something new instead of changing what they were given are easier to reason about, because nothing changes behind your back.'
    ],
    task: 'Write evens(numbers) returning only the even numbers, in their original order.',
    starter: 'function evens(numbers) {\n  // keep the even ones\n}\n',
    solution: 'function evens(numbers) {\n  return numbers.filter((number) => number % 2 === 0);\n}\n',
    check: 'run',
    run: [
      { call: 'JSON.stringify(evens([1, 2, 3, 4]))', expected: '[2,4]', hint: 'A number is even when the remainder of dividing by 2 is 0: number % 2 === 0' },
      { call: 'JSON.stringify(evens([1, 3]))', expected: '[]', hint: 'When nothing matches the result is an empty array, not undefined.' },
      { call: 'JSON.stringify(evens([0, -2, 7]))', expected: '[0,-2]', hint: 'Zero and negative even numbers are still even.' }
    ]
  }
];

/* -------------------------------------------------------------------------- */

export const TRACKS: Track[] = [
  {
    id: 'python',
    name: 'Python',
    badge: 'PY',
    colour: '#3b74a8',
    blurb: 'The usual first language. Readable, forgiving, and used for almost everything.',
    checking:
      'These lessons read your code rather than run it, so they check that you used the right idea. Install the editor to run Python for real.',
    lessons: PYTHON_LESSONS
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    badge: 'JS',
    colour: '#e8c65b',
    darkText: true,
    blurb: 'The language of the browser, and the one running this page right now.',
    checking:
      'These lessons actually run your code in a sandbox in your browser and compare the results, so a passing lesson means working code.',
    lessons: JAVASCRIPT_LESSONS
  }
];

/** The tracks that are planned but not written yet, named honestly. */
export const PLANNED_TRACKS = ['TypeScript', 'Go', 'Rust', 'SQL'];
