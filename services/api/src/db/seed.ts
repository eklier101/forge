import { db } from "./client.js";
import { exercises } from "./schema.js";

type Ex = { id: string; name: string; muscleGroup: string; equipment: string; location: string };

/** Large built-in catalog — equipment keys match ownedEquipment prefs. */
export const DEFAULT_EXERCISES: Ex[] = [
  // Chest
  { id: "bench_press", name: "Barbell Bench Press", muscleGroup: "chest", equipment: "barbell", location: "gym" },
  { id: "incline_bench_press", name: "Incline Barbell Bench Press", muscleGroup: "chest", equipment: "barbell", location: "gym" },
  { id: "decline_bench_press", name: "Decline Barbell Bench Press", muscleGroup: "chest", equipment: "barbell", location: "gym" },
  { id: "dumbbell_bench_press", name: "Dumbbell Bench Press", muscleGroup: "chest", equipment: "dumbbell", location: "gym" },
  { id: "incline_dumbbell_press", name: "Incline Dumbbell Press", muscleGroup: "chest", equipment: "dumbbell", location: "gym" },
  { id: "decline_dumbbell_press", name: "Decline Dumbbell Press", muscleGroup: "chest", equipment: "dumbbell", location: "gym" },
  { id: "dumbbell_fly", name: "Dumbbell Fly", muscleGroup: "chest", equipment: "dumbbell", location: "gym" },
  { id: "incline_dumbbell_fly", name: "Incline Dumbbell Fly", muscleGroup: "chest", equipment: "dumbbell", location: "gym" },
  { id: "cable_fly", name: "Cable Fly", muscleGroup: "chest", equipment: "cable", location: "gym" },
  { id: "cable_crossover", name: "Cable Crossover", muscleGroup: "chest", equipment: "cable", location: "gym" },
  { id: "pec_deck", name: "Pec Deck", muscleGroup: "chest", equipment: "machine", location: "gym" },
  { id: "chest_press_machine", name: "Chest Press Machine", muscleGroup: "chest", equipment: "machine", location: "gym" },
  { id: "smith_bench_press", name: "Smith Machine Bench Press", muscleGroup: "chest", equipment: "smith", location: "gym" },
  { id: "push_up", name: "Push-Up", muscleGroup: "chest", equipment: "bodyweight", location: "both" },
  { id: "diamond_push_up", name: "Diamond Push-Up", muscleGroup: "chest", equipment: "bodyweight", location: "home" },
  { id: "decline_push_up", name: "Decline Push-Up", muscleGroup: "chest", equipment: "bodyweight", location: "home" },
  { id: "band_chest_press", name: "Band Chest Press", muscleGroup: "chest", equipment: "band", location: "home" },

  // Back
  { id: "deadlift", name: "Conventional Deadlift", muscleGroup: "back", equipment: "barbell", location: "gym" },
  { id: "barbell_row", name: "Barbell Bent-Over Row", muscleGroup: "back", equipment: "barbell", location: "gym" },
  { id: "pendlay_row", name: "Pendlay Row", muscleGroup: "back", equipment: "barbell", location: "gym" },
  { id: "t_bar_row", name: "T-Bar Row", muscleGroup: "back", equipment: "barbell", location: "gym" },
  { id: "dumbbell_row", name: "One-Arm Dumbbell Row", muscleGroup: "back", equipment: "dumbbell", location: "gym" },
  { id: "chest_supported_row", name: "Chest-Supported Dumbbell Row", muscleGroup: "back", equipment: "dumbbell", location: "gym" },
  { id: "lat_pulldown", name: "Lat Pulldown", muscleGroup: "back", equipment: "cable", location: "gym" },
  { id: "close_grip_lat_pulldown", name: "Close-Grip Lat Pulldown", muscleGroup: "back", equipment: "cable", location: "gym" },
  { id: "seated_cable_row", name: "Seated Cable Row", muscleGroup: "back", equipment: "cable", location: "gym" },
  { id: "face_pull", name: "Face Pull", muscleGroup: "back", equipment: "cable", location: "gym" },
  { id: "straight_arm_pulldown", name: "Straight-Arm Pulldown", muscleGroup: "back", equipment: "cable", location: "gym" },
  { id: "pull_up", name: "Pull-Up", muscleGroup: "back", equipment: "pullup_bar", location: "gym" },
  { id: "chin_up", name: "Chin-Up", muscleGroup: "back", equipment: "pullup_bar", location: "gym" },
  { id: "neutral_grip_pull_up", name: "Neutral-Grip Pull-Up", muscleGroup: "back", equipment: "pullup_bar", location: "gym" },
  { id: "assisted_pull_up", name: "Assisted Pull-Up Machine", muscleGroup: "back", equipment: "machine", location: "gym" },
  { id: "seated_row_machine", name: "Seated Row Machine", muscleGroup: "back", equipment: "machine", location: "gym" },
  { id: "smith_row", name: "Smith Machine Row", muscleGroup: "back", equipment: "smith", location: "gym" },
  { id: "kettlebell_row", name: "Kettlebell Row", muscleGroup: "back", equipment: "kettlebell", location: "gym" },
  { id: "band_pull_apart", name: "Band Pull-Apart", muscleGroup: "back", equipment: "band", location: "home" },
  { id: "inverted_row", name: "Inverted Row", muscleGroup: "back", equipment: "bodyweight", location: "home" },

  // Shoulders
  { id: "overhead_press", name: "Barbell Overhead Press", muscleGroup: "shoulders", equipment: "barbell", location: "gym" },
  { id: "push_press", name: "Push Press", muscleGroup: "shoulders", equipment: "barbell", location: "gym" },
  { id: "dumbbell_shoulder_press", name: "Dumbbell Shoulder Press", muscleGroup: "shoulders", equipment: "dumbbell", location: "gym" },
  { id: "arnold_press", name: "Arnold Press", muscleGroup: "shoulders", equipment: "dumbbell", location: "gym" },
  { id: "lateral_raise", name: "Dumbbell Lateral Raise", muscleGroup: "shoulders", equipment: "dumbbell", location: "gym" },
  { id: "front_raise", name: "Dumbbell Front Raise", muscleGroup: "shoulders", equipment: "dumbbell", location: "gym" },
  { id: "rear_delt_fly", name: "Rear Delt Fly", muscleGroup: "shoulders", equipment: "dumbbell", location: "gym" },
  { id: "cable_lateral_raise", name: "Cable Lateral Raise", muscleGroup: "shoulders", equipment: "cable", location: "gym" },
  { id: "cable_rear_delt_fly", name: "Cable Rear Delt Fly", muscleGroup: "shoulders", equipment: "cable", location: "gym" },
  { id: "machine_shoulder_press", name: "Machine Shoulder Press", muscleGroup: "shoulders", equipment: "machine", location: "gym" },
  { id: "reverse_pec_deck", name: "Reverse Pec Deck", muscleGroup: "shoulders", equipment: "machine", location: "gym" },
  { id: "smith_overhead_press", name: "Smith Overhead Press", muscleGroup: "shoulders", equipment: "smith", location: "gym" },
  { id: "kettlebell_press", name: "Kettlebell Press", muscleGroup: "shoulders", equipment: "kettlebell", location: "gym" },
  { id: "band_lateral_raise", name: "Band Lateral Raise", muscleGroup: "shoulders", equipment: "band", location: "home" },
  { id: "pike_push_up", name: "Pike Push-Up", muscleGroup: "shoulders", equipment: "bodyweight", location: "home" },

  // Legs / quads
  { id: "back_squat", name: "Back Squat", muscleGroup: "legs", equipment: "barbell", location: "gym" },
  { id: "front_squat", name: "Front Squat", muscleGroup: "legs", equipment: "barbell", location: "gym" },
  { id: "pause_squat", name: "Pause Squat", muscleGroup: "legs", equipment: "barbell", location: "gym" },
  { id: "goblet_squat", name: "Goblet Squat", muscleGroup: "legs", equipment: "dumbbell", location: "gym" },
  { id: "dumbbell_lunge", name: "Dumbbell Walking Lunge", muscleGroup: "legs", equipment: "dumbbell", location: "gym" },
  { id: "bulgarian_split_squat", name: "Bulgarian Split Squat", muscleGroup: "legs", equipment: "dumbbell", location: "gym" },
  { id: "leg_press", name: "Leg Press", muscleGroup: "legs", equipment: "machine", location: "gym" },
  { id: "hack_squat", name: "Hack Squat", muscleGroup: "legs", equipment: "machine", location: "gym" },
  { id: "leg_extension", name: "Leg Extension", muscleGroup: "legs", equipment: "machine", location: "gym" },
  { id: "smith_squat", name: "Smith Machine Squat", muscleGroup: "legs", equipment: "smith", location: "gym" },
  { id: "cable_leg_kickback", name: "Cable Glute Kickback", muscleGroup: "glutes", equipment: "cable", location: "gym" },
  { id: "kettlebell_goblet_squat", name: "Kettlebell Goblet Squat", muscleGroup: "legs", equipment: "kettlebell", location: "gym" },
  { id: "bodyweight_squat", name: "Bodyweight Squat", muscleGroup: "legs", equipment: "bodyweight", location: "home" },
  { id: "lunges", name: "Bodyweight Lunge", muscleGroup: "legs", equipment: "bodyweight", location: "home" },
  { id: "jump_squat", name: "Jump Squat", muscleGroup: "legs", equipment: "bodyweight", location: "home" },
  { id: "band_squat", name: "Band Squat", muscleGroup: "legs", equipment: "band", location: "home" },

  // Hamstrings / glutes
  { id: "romanian_deadlift", name: "Romanian Deadlift", muscleGroup: "hamstrings", equipment: "barbell", location: "gym" },
  { id: "stiff_leg_deadlift", name: "Stiff-Leg Deadlift", muscleGroup: "hamstrings", equipment: "barbell", location: "gym" },
  { id: "dumbbell_rdl", name: "Dumbbell RDL", muscleGroup: "hamstrings", equipment: "dumbbell", location: "gym" },
  { id: "good_morning", name: "Good Morning", muscleGroup: "hamstrings", equipment: "barbell", location: "gym" },
  { id: "leg_curl", name: "Lying Leg Curl", muscleGroup: "hamstrings", equipment: "machine", location: "gym" },
  { id: "seated_leg_curl", name: "Seated Leg Curl", muscleGroup: "hamstrings", equipment: "machine", location: "gym" },
  { id: "nordic_curl", name: "Nordic Hamstring Curl", muscleGroup: "hamstrings", equipment: "bodyweight", location: "gym" },
  { id: "hip_thrust", name: "Barbell Hip Thrust", muscleGroup: "glutes", equipment: "barbell", location: "gym" },
  { id: "glute_bridge", name: "Glute Bridge", muscleGroup: "glutes", equipment: "bodyweight", location: "both" },
  { id: "cable_pull_through", name: "Cable Pull-Through", muscleGroup: "glutes", equipment: "cable", location: "gym" },
  { id: "kettlebell_swing", name: "Kettlebell Swing", muscleGroup: "glutes", equipment: "kettlebell", location: "gym" },
  { id: "single_leg_glute_bridge", name: "Single-Leg Glute Bridge", muscleGroup: "glutes", equipment: "bodyweight", location: "home" },

  // Calves
  { id: "standing_calf_raise", name: "Standing Calf Raise", muscleGroup: "calves", equipment: "machine", location: "gym" },
  { id: "seated_calf_raise", name: "Seated Calf Raise", muscleGroup: "calves", equipment: "machine", location: "gym" },
  { id: "dumbbell_calf_raise", name: "Dumbbell Calf Raise", muscleGroup: "calves", equipment: "dumbbell", location: "gym" },
  { id: "smith_calf_raise", name: "Smith Calf Raise", muscleGroup: "calves", equipment: "smith", location: "gym" },
  { id: "bodyweight_calf_raise", name: "Bodyweight Calf Raise", muscleGroup: "calves", equipment: "bodyweight", location: "home" },

  // Biceps
  { id: "barbell_curl", name: "Barbell Curl", muscleGroup: "biceps", equipment: "barbell", location: "gym" },
  { id: "ez_bar_curl", name: "EZ-Bar Curl", muscleGroup: "biceps", equipment: "ez_bar", location: "gym" },
  { id: "dumbbell_curl", name: "Dumbbell Curl", muscleGroup: "biceps", equipment: "dumbbell", location: "gym" },
  { id: "hammer_curl", name: "Hammer Curl", muscleGroup: "biceps", equipment: "dumbbell", location: "gym" },
  { id: "incline_dumbbell_curl", name: "Incline Dumbbell Curl", muscleGroup: "biceps", equipment: "dumbbell", location: "gym" },
  { id: "concentration_curl", name: "Concentration Curl", muscleGroup: "biceps", equipment: "dumbbell", location: "gym" },
  { id: "cable_curl", name: "Cable Curl", muscleGroup: "biceps", equipment: "cable", location: "gym" },
  { id: "preacher_curl", name: "Preacher Curl", muscleGroup: "biceps", equipment: "ez_bar", location: "gym" },
  { id: "machine_bicep_curl", name: "Machine Bicep Curl", muscleGroup: "biceps", equipment: "machine", location: "gym" },
  { id: "band_curl", name: "Band Curl", muscleGroup: "biceps", equipment: "band", location: "home" },

  // Triceps
  { id: "close_grip_bench", name: "Close-Grip Bench Press", muscleGroup: "triceps", equipment: "barbell", location: "gym" },
  { id: "skull_crusher", name: "Skull Crusher", muscleGroup: "triceps", equipment: "ez_bar", location: "gym" },
  { id: "overhead_triceps_extension", name: "Overhead Triceps Extension", muscleGroup: "triceps", equipment: "dumbbell", location: "gym" },
  { id: "kickback", name: "Triceps Kickback", muscleGroup: "triceps", equipment: "dumbbell", location: "gym" },
  { id: "tricep_pushdown", name: "Tricep Pushdown", muscleGroup: "triceps", equipment: "cable", location: "gym" },
  { id: "rope_pushdown", name: "Rope Pushdown", muscleGroup: "triceps", equipment: "cable", location: "gym" },
  { id: "overhead_cable_extension", name: "Overhead Cable Extension", muscleGroup: "triceps", equipment: "cable", location: "gym" },
  { id: "dip", name: "Parallel Bar Dip", muscleGroup: "triceps", equipment: "bodyweight", location: "gym" },
  { id: "bench_dip", name: "Bench Dip", muscleGroup: "triceps", equipment: "bodyweight", location: "both" },
  { id: "machine_dip", name: "Machine Dip", muscleGroup: "triceps", equipment: "machine", location: "gym" },
  { id: "band_pushdown", name: "Band Tricep Pushdown", muscleGroup: "triceps", equipment: "band", location: "home" },

  // Core
  { id: "plank", name: "Plank", muscleGroup: "core", equipment: "bodyweight", location: "both" },
  { id: "side_plank", name: "Side Plank", muscleGroup: "core", equipment: "bodyweight", location: "both" },
  { id: "sit_up", name: "Sit-Up", muscleGroup: "core", equipment: "bodyweight", location: "home" },
  { id: "crunch", name: "Crunch", muscleGroup: "core", equipment: "bodyweight", location: "both" },
  { id: "hanging_leg_raise", name: "Hanging Leg Raise", muscleGroup: "core", equipment: "pullup_bar", location: "gym" },
  { id: "captains_chair_raise", name: "Captain's Chair Leg Raise", muscleGroup: "core", equipment: "machine", location: "gym" },
  { id: "cable_crunch", name: "Cable Crunch", muscleGroup: "core", equipment: "cable", location: "gym" },
  { id: "ab_wheel", name: "Ab Wheel Rollout", muscleGroup: "core", equipment: "bodyweight", location: "gym" },
  { id: "russian_twist", name: "Russian Twist", muscleGroup: "core", equipment: "bodyweight", location: "home" },
  { id: "dead_bug", name: "Dead Bug", muscleGroup: "core", equipment: "bodyweight", location: "home" },
  { id: "bird_dog", name: "Bird Dog", muscleGroup: "core", equipment: "bodyweight", location: "home" },
  { id: "mountain_climber", name: "Mountain Climber", muscleGroup: "core", equipment: "bodyweight", location: "home" },
  { id: "hollow_hold", name: "Hollow Body Hold", muscleGroup: "core", equipment: "bodyweight", location: "home" },
  { id: "pallof_press", name: "Pallof Press", muscleGroup: "core", equipment: "cable", location: "gym" },
  { id: "kettlebell_windmill", name: "Kettlebell Windmill", muscleGroup: "core", equipment: "kettlebell", location: "gym" },

  // Full / conditioning
  { id: "burpee", name: "Burpee", muscleGroup: "full", equipment: "bodyweight", location: "home" },
  { id: "jumping_jack", name: "Jumping Jack", muscleGroup: "full", equipment: "bodyweight", location: "home" },
  { id: "high_knees", name: "High Knees", muscleGroup: "full", equipment: "bodyweight", location: "home" },
  { id: "farmer_carry", name: "Farmer Carry", muscleGroup: "full", equipment: "dumbbell", location: "gym" },
  { id: "kettlebell_clean", name: "Kettlebell Clean", muscleGroup: "full", equipment: "kettlebell", location: "gym" },
  { id: "thruster", name: "Barbell Thruster", muscleGroup: "full", equipment: "barbell", location: "gym" },
  { id: "dumbbell_thruster", name: "Dumbbell Thruster", muscleGroup: "full", equipment: "dumbbell", location: "gym" },
  { id: "row_erg", name: "Rowing Machine", muscleGroup: "full", equipment: "machine", location: "gym" },
  { id: "assault_bike", name: "Assault Bike", muscleGroup: "full", equipment: "machine", location: "gym" },
  { id: "sled_push", name: "Sled Push", muscleGroup: "full", equipment: "machine", location: "gym" },
];

export const EQUIPMENT_OPTIONS = [
  { id: "barbell", label: "Barbell" },
  { id: "dumbbell", label: "Dumbbells" },
  { id: "cable", label: "Cable stack" },
  { id: "machine", label: "Machines" },
  { id: "smith", label: "Smith machine" },
  { id: "ez_bar", label: "EZ bar" },
  { id: "kettlebell", label: "Kettlebells" },
  { id: "band", label: "Resistance bands" },
  { id: "pullup_bar", label: "Pull-up bar" },
  { id: "bench", label: "Bench" },
  { id: "bodyweight", label: "Bodyweight" },
] as const;

export async function seedExercises() {
  for (const ex of DEFAULT_EXERCISES) {
    await db
      .insert(exercises)
      .values({ ...ex, isCustom: false })
      .onConflictDoUpdate({
        target: exercises.id,
        set: {
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          equipment: ex.equipment,
          location: ex.location,
        },
      });
  }
}
