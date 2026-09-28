// Fixed task list — every team plays the same list, same point values.
// Edit this list to change what shows up in the game.

const TASKS = [
  { text: "Imitate a celebrity for 15 seconds", points: 10 },
  { text: "One person sings The Eyes of Texas", points: 20 },
  { text: "One person counts to 100 out loud", points: 30 },
  { text: "Entire team claps and sings to \u201cLet It Go\u201d for 30 seconds", points: 40 },
  { text: "Complete today's Wordle (must be correct!)", points: 50 },
  { text: "Build a paper airplane that flies at least 10 feet (~3 tables)", points: 60 },
  { text: "Text Dr. Barnes and receive a response", points: 70 },
  { text: "Write out all 50 states", points: 80 },
  { text: "Drink an entire water bottle", points: 90 },
  { text: "Complete the NYT Connections", points: 100 },
  { text: "List 26 food items beginning with each letter of the alphabet", points: 110 },
  { text: "Complete 100 push-ups (can be across multiple team members)", points: 120 },
];

/**
 * Build a team's copy of the fixed task board. Every team gets the same
 * tasks and point values; each team claims/completes its own copy.
 */
function generateTaskBoard() {
  return TASKS.map((task, index) => ({
    id: `task-${index}-${Date.now().toString(36)}`,
    text: task.text,
    points: task.points,
    status: "available",
    claimedBy: null,
    teamIndex: null,
  }));
}

module.exports = { generateTaskBoard };
