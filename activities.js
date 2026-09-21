// Pool of activities, grouped by difficulty tier.
// Point value ranges scale with how long/hard the activity is.
// Feel free to edit this list to fit your group.

const POOL = [
  // Tier 1 — quick & easy (10-20 pts)
  { text: "Do 20 jumping jacks on camera / in front of your team", tier: 1 },
  { text: "Name 10 movies in under 30 seconds", tier: 1 },
  { text: "Draw a self-portrait in 60 seconds", tier: 1 },
  { text: "Recite the alphabet backwards", tier: 1 },
  { text: "Balance a spoon on your nose for 10 seconds", tier: 1 },
  { text: "Sing the chorus of a song picked by a teammate", tier: 1 },
  { text: "Do your best impression of a celebrity", tier: 1 },
  { text: "Solve a riddle within 3 guesses", tier: 1 },
  { text: "Say the pledge of allegiance without a single mistake", tier: 1 },
  { text: "Hold a plank for 30 seconds", tier: 1 },

  // Tier 2 — moderate (25-40 pts)
  { text: "Memorize and recite a 6-line poem after reading it once", tier: 2 },
  { text: "Do 40 push-ups (can be broken into sets)", tier: 2 },
  { text: "Build a house of cards at least 3 stories tall", tier: 2 },
  { text: "Write and perform a 30-second rap about your team", tier: 2 },
  { text: "Solve a medium Sudoku puzzle", tier: 2 },
  { text: "Juggle 3 objects for 15 continuous seconds", tier: 2 },
  { text: "Name all 50 US states in under 3 minutes", tier: 2 },
  { text: "Do a 5-minute plank challenge (cumulative)", tier: 2 },
  { text: "Recreate a famous painting using household items", tier: 2 },
  { text: "Speed-solve a Rubik's cube face (one side)", tier: 2 },

  // Tier 3 — hard / time-consuming (45-65 pts)
  { text: "Memorize and recite the first 20 digits of pi", tier: 3 },
  { text: "Do 100 total squats (can be broken into sets)", tier: 3 },
  { text: "Write a full short story (150+ words) in 10 minutes", tier: 3 },
  { text: "Solve a full Rubik's cube from scratch", tier: 3 },
  { text: "Learn and perform a 30-second choreographed dance", tier: 3 },
  { text: "Build a paper airplane that flies 15+ feet, on the first 3 tries", tier: 3 },
  { text: "Complete a 500-piece-equivalent jigsaw puzzle section (timed)", tier: 3 },
  { text: "Cook or assemble a simple dish and present it", tier: 3 },
  { text: "Give a 2-minute persuasive speech on a random topic", tier: 3 },
  { text: "Do a handstand against a wall for 20 seconds", tier: 3 },

  // Tier 4 — very hard / long (70-100 pts)
  { text: "Learn a magic trick and perform it convincingly", tier: 4 },
  { text: "Write and memorize a 1-minute stand-up comedy bit", tier: 4 },
  { text: "Complete 200 total burpees (can be broken into sets)", tier: 4 },
  { text: "Build a working paper catapult that launches an object 3+ feet", tier: 4 },
  { text: "Learn to say a full introduction in a foreign language and perform it", tier: 4 },
  { text: "Memorize and recite a 12-line monologue after reading it 3 times", tier: 4 },
  { text: "Solve a hard logic/escape-room style puzzle", tier: 4 },
  { text: "Compose and perform a 1-minute original song", tier: 4 },
];

const TIER_RANGES = {
  1: [10, 20],
  2: [25, 40],
  3: [45, 65],
  4: [70, 100],
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a randomized task board with `count` activities, each with a
 * distinct point value (no two tasks share the same score).
 */
function generateTaskBoard(count = 12) {
  const shuffledPool = shuffle(POOL);
  const chosen = shuffledPool.slice(0, Math.min(count, shuffledPool.length));

  const usedPoints = new Set();
  const tasks = chosen.map((activity, index) => {
    const [min, max] = TIER_RANGES[activity.tier];
    let points = randInt(min, max);
    while (usedPoints.has(points)) points += 1;
    usedPoints.add(points);
    return {
      id: `task-${index}-${Date.now().toString(36)}`,
      text: activity.text,
      tier: activity.tier,
      points,
      status: "available", // available | in-progress | completed
      claimedBy: null, // { playerId, name }
      teamIndex: null, // which team locked this task in progress/completed
    };
  });

  return tasks.sort((a, b) => a.points - b.points);
}

module.exports = { generateTaskBoard };
