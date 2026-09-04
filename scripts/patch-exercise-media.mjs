import fs from "fs";

const path = new URL("../services/api/src/db/exerciseMedia.generated.json", import.meta.url);
const m = JSON.parse(fs.readFileSync(path, "utf8"));

const patches = {
  pec_deck: {
    images: ["Butterfly/0.jpg", "Butterfly/1.jpg"],
    sourceName: "Butterfly (Pec Deck)",
    instructions: [
      "Sit on the machine with your back flat on the pad.",
      "Take hold of the handles with upper arms parallel to the floor.",
      "Push the handles together slowly as you squeeze your chest.",
      "Return under control until the chest is stretched, then repeat.",
    ],
  },
  reverse_pec_deck: {
    images: ["Reverse_Machine_Flyes/0.jpg", "Reverse_Machine_Flyes/1.jpg"],
    sourceName: "Reverse Machine Flyes",
    instructions: [
      "Adjust handles fully to the rear and set seat so handles are at shoulder height.",
      "Grasp handles with hands facing inwards.",
      "In a semicircle, pull hands out to the side and back, squeezing rear delts.",
      "Pause, then return slowly to the start.",
    ],
  },
  band_pushdown: {
    images: ["Triceps_Pushdown/0.jpg", "Triceps_Pushdown/1.jpg"],
    sourceName: "Triceps Pushdown (band/cable pattern)",
    instructions: [
      "Anchor a band high overhead (or use a cable).",
      "Grip with palms down, elbows pinned to your sides.",
      "Extend the elbows until arms are straight, squeezing the triceps.",
      "Return under control without letting elbows drift forward.",
    ],
  },
  captains_chair_raise: {
    images: ["Knee_Hip_Raise_On_Parallel_Bars/0.jpg", "Knee_Hip_Raise_On_Parallel_Bars/1.jpg"],
    sourceName: "Knee Hip Raise On Parallel Bars",
    instructions: [
      "Support yourself on the captains chair with forearms on the pads and back against the pad.",
      "Legs hang straight toward the floor.",
      "Raise knees toward the chest while keeping the torso still.",
      "Lower under control and repeat.",
    ],
  },
  bird_dog: {
    images: ["Superman/0.jpg", "Superman/1.jpg"],
    sourceName: "Bird Dog (floor anti-rotation)",
    instructions: [
      "Start on all fours with hands under shoulders and knees under hips.",
      "Brace your core so the spine stays neutral.",
      "Extend one arm forward and the opposite leg back until both are parallel to the floor.",
      "Hold briefly, return, then switch sides.",
    ],
  },
  hollow_hold: {
    images: ["Dead_Bug/0.jpg", "Dead_Bug/1.jpg"],
    sourceName: "Hollow Body Hold",
    instructions: [
      "Lie on your back and press the lower back into the floor.",
      "Lift shoulders and legs slightly off the ground with arms by your ears or at your sides.",
      "Keep ribs down and hold a tight hollow shape.",
      "Breathe steadily; stop if the lower back arches.",
    ],
  },
  burpee: {
    images: ["Freehand_Jump_Squat/0.jpg", "Freehand_Jump_Squat/1.jpg"],
    sourceName: "Burpee",
    instructions: [
      "Stand tall, then squat and place hands on the floor.",
      "Jump the feet back to a high plank.",
      "Optional push-up, then jump the feet forward to the squat.",
      "Explode upward into a jump and repeat.",
    ],
  },
  side_plank: {
    images: ["Side_Bridge/0.jpg", "Side_Bridge/1.jpg"],
    sourceName: "Side Bridge / Side Plank",
    instructions: [
      "Lie on one side with legs stacked and elbow under the shoulder.",
      "Lift the hips so the body forms a straight line from head to heels.",
      "Hold without letting the hips sag or rotate forward.",
      "Switch sides after the prescribed time or reps.",
    ],
  },
  standing_calf_raise: {
    images: ["Standing_Calf_Raises/0.jpg", "Standing_Calf_Raises/1.jpg"],
    sourceName: "Standing Calf Raises",
    instructions: [
      "Stand with the balls of your feet on a step or calf block, heels hanging off.",
      "Rise as high as possible onto the toes, squeezing the calves.",
      "Pause briefly at the top.",
      "Lower heels under control into a stretch, then repeat.",
    ],
  },
  seated_calf_raise: {
    images: ["Seated_Calf_Raise/0.jpg", "Seated_Calf_Raise/1.jpg"],
    sourceName: "Seated Calf Raise",
    instructions: [
      "Sit on the seated calf machine with toes on the platform and heels hanging off.",
      "Place thighs under the pad and hold it steady.",
      "Raise the heels as high as possible.",
      "Lower into a stretch and repeat.",
    ],
  },
  bodyweight_calf_raise: {
    images: ["Standing_Calf_Raises/0.jpg", "Standing_Calf_Raises/1.jpg"],
    sourceName: "Standing Calf Raises",
    instructions: [
      "Stand on a step with heels hanging off, holding a wall or rail for balance.",
      "Rise onto the balls of your feet, squeezing the calves.",
      "Pause at the top, then lower into a stretch.",
      "Repeat for the prescribed reps.",
    ],
  },
  tricep_pushdown: {
    images: ["Triceps_Pushdown/0.jpg", "Triceps_Pushdown/1.jpg"],
    sourceName: "Triceps Pushdown",
    instructions: [
      "Attach a straight or angled bar to a high pulley with an overhand grip.",
      "Pin upper arms to your sides and extend the elbows until arms are straight.",
      "Squeeze the triceps at the bottom.",
      "Return under control without letting elbows flare.",
    ],
  },
};

for (const [k, v] of Object.entries(patches)) {
  if (!m[k]) {
    console.log("MISSING KEY", k);
    continue;
  }
  m[k] = { ...m[k], ...v };
  console.log("patched", k, m[k].images.join(","));
}

fs.writeFileSync(path, JSON.stringify(m, null, 2) + "\n");
console.log("done");
