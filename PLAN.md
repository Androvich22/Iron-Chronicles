# Iron Chronicles — Product and Implementation Plan

## Purpose

Build a reliable, local-first gym tracker for serious lifters. Workout logging is the primary feature: it should be fast enough for everyday gym use, preserve data across interruptions, and make progress easy to review. The medieval setting should shape the atmosphere and visual language without adding role-playing systems.

This document captures the product interview and is the working blueprint for incremental implementation. It is not a commitment to implement every phase at once.

## Product decisions

- **Product name:** Iron Chronicles.
- **Primary audience:** Serious lifters who want detailed training data.
- **Initial platform:** Android only.
- **Data ownership:** No account, backend, or cloud sync in v1. Store data on the device.
- **First-week value:** Log workouts quickly and see progress.
- **First-run experience:** Open to the Dashboard with prominent Start Workout and Create Routine actions. If an active workout exists, offer to resume it.
- **Language:** English only in v1. Keep copy structured for possible future translation.
- **Weight unit:** Kilograms in v1.
- **Appearance:** One fixed dark medieval theme, with no cosmetic customization in v1.
- **Out of scope:** Social features, nutrition, coaching plans, wearable integrations, and subscriptions.
- **Primary navigation:** Dashboard, Workouts, Routines, Progress, and Library. Settings are reached from the Dashboard rather than adding a sixth tab.

## v1 feature scope

### In scope

- Dashboard with a workout-start action and a concise overview of recent training and progress.
- Workout sessions started from either a saved routine or an empty workout.
- Logging individual sets with reps and optional external load, plus warm-up or working-set classification.
- Autosaving and recovery of an active workout after app closure.
- An adjustable rest timer that starts after set completion, with an Android notification when the timer ends in the background if notification permission is granted.
- Multiple editable routines with ordered exercises and target set counts and rep ranges.
- An exercise library combining built-in and user-created exercises, searchable and filterable by muscle group and equipment.
- Workout history, completed-workout editing and deletion, personal records, strength trends, and understated training milestones.
- JSON export and import for local backup and restore.
- Workout completion summary, previous-performance comparison, routine duplication/deletion, set notes, and practical weekly/monthly training summaries.

### Out of scope

- Accounts, authentication, roles, server APIs, cloud storage, and multi-device synchronization.
- Social sharing, nutrition tracking, coaching plans, wearables, and subscriptions or billing.
- Points, levels, RPG mechanics, streak pressure, selectable environments, and theme customization.
- iOS and web support in v1.
- Timed and distance-based exercise logging are reserved for a later version; v1 supports resistance/bodyweight repetition tracking.
- User profile images, cosmetic rewards, selectable units, and profile customization are not part of v1.

## Core user journeys

### First use

1. The user opens the Dashboard.
2. The Dashboard offers Start Workout and Create Routine.
3. The user can start an empty session immediately, or create a routine from the exercise library.

### Workout logging

1. Start from a saved routine or choose an empty workout.
2. Add or remove exercises during the session. If an exercise is removed, retain any sets already logged.
3. For each set, enter reps and optional external load in kg, select warm-up or working type, and mark it complete.
4. Autosave each change. Completing a set starts a 90-second rest timer; the duration can be changed before or during the rest.
5. If the app closes, keep the workout active and resume it from the last saved state. If the timer expired while the app was backgrounded, show that it has ended when the user returns.
6. Finishing the session creates a completed workout. Discarding an active workout requires confirmation; keep its autosaved data until the user confirms.
7. Show a completion summary with start/end time, duration, exercises, completed sets, total reps where applicable, recorded training volume where load data supports it, new records, and newly earned milestones.

### Routine management

1. Create a routine and add exercises from the library.
2. Set exercise order, target set count, and rep range.
3. Edit the routine at any time. Starting it creates a workout based on its current contents. On later starts, prefill each exercise’s set loads from its most recent completed working sets in that same routine; use the routine’s saved target load when no prior logged load exists, and repeat the last logged load for additional sets.
4. During a workout, allow changes without deleting completed set records.
5. Allow routines to be renamed, duplicated, and deleted after confirmation. Routine entries may include an optional target load, rest duration, and note in addition to target sets and rep range.

### History and progress

1. Browse completed workouts and open their details.
2. Edit or delete a completed workout.
3. Recalculate records and progress after an edit or deletion.
4. Show trends based only on actual logged sessions; do not fill gaps with zero-activity data.
5. Present real training records and milestones quietly, without points, levels, or pressure-based streaks.
6. Support exercise history comparisons and useful filters for exercise, date range, routine, muscle group, and weekly/monthly period where relevant.

### Backup and restore

1. Export local records as a versioned JSON file that the user can save or share.
2. Select a JSON file to restore.
3. Validate it and show a preview/summary before any replacement.
4. Require explicit confirmation before replacing all existing app data. If validation fails or the user cancels, retain current data unchanged.

## Navigation and page hierarchy

Use Expo Router and keep route files in `src/app/`. Use a bottom-tab shell for the primary sections and stack routes for nested flows.

- **Dashboard** — recent activity, progress summary, Start Workout, Create Routine, and resume-active-workout action when applicable.
- **Workouts** — start empty or from a routine; active workout screen; completed workout detail/history.
- **Routines** — routine list, routine creation, and routine editor.
- **Progress** — strength trends, personal records, and milestones.
- **Library** — exercise search, filters, exercise details, and custom exercise creation/editing.
- **Nested flows** — workout logging, exercise selection, routine editing, workout detail/editing, and import/export confirmation.

The active workout should remain easy to resume from the Dashboard and should not be lost when the user navigates to another tab.

## Initial data model

Use stable IDs and explicit relationships. Keep user-entered exercise and workout history intact when routines are later edited.

### Exercise

- `id`
- `name`
- `source`: built-in or user-created
- `primaryMuscleGroup` and optional secondary muscle groups
- `equipment`
- `loadType`: externally loaded, bodyweight, or bodyweight-with-added-load as needed by the catalog
- `trackingType`: v1 implements loaded reps and bodyweight reps; reserve a clear extension point for duration and distance tracking in a later version
- Optional short instructions and archive state

Built-in exercises are seeded locally. User-created exercises are stored in the same library with their source marked as custom.

### Routine

- `id`, `name`, optional notes
- Created and updated timestamps
- Ordered routine exercise entries

### Routine exercise entry

- `id`, `routineId`, `exerciseId`, order index
- Target set count
- Target rep minimum and maximum
- Optional target load in kg, per-exercise rest duration, and note; absent rest value uses the 90-second default

### Workout

- `id`
- Optional `routineId` reference, plus a snapshot of the routine name for history display
- Status: active or completed
- Start and completion timestamps
- Ordered workout exercise entries

There is at most one active workout at a time. An explicitly discarded workout is removed after confirmation; discarded sessions do not appear in history or records.

### Workout exercise entry

- `id`, `workoutId`, `exerciseId`
- Snapshot of exercise name and relevant display metadata, so history remains readable if the library entry changes or is archived
- Order index
- Optional target set count and rep range copied from its routine at workout start
- Skipped/removed state as needed to distinguish an intentionally omitted exercise from a completed one

### Set

- `id`, `workoutExerciseId`, order index
- `setType`: warm-up or working
- Repetitions
- Optional external load in kg; nullable for bodyweight-only sets. Optional bodyweight assistance is recorded separately from added load and is not compared as a positive-load PR.
- Optional set note
- Completion state and completion timestamp

Only completed working sets contribute to PRs and strength analysis. Warm-up sets remain in workout history but are excluded from these calculations.

### Achievements and user preferences

- Define a small catalog of transparent training milestones (for example, first completed workout, first record, 25/100 completed workouts, and exercise-specific records). Derive eligibility from saved workout data and record the earned date so an award cannot duplicate.
- Show milestones in Progress and the workout completion summary, with a concise notification when newly earned. Do not use cosmetic unlocks, points, levels, profile borders, or streak pressure in v1.
- Store only necessary local preferences (such as rest timer behavior and notification preference/permission state). Do not require a display name, profile image, or other personal information.

### Personal records and milestones

Treat these as derived from completed workouts rather than the sole source of truth. Recompute after completed workout edits or deletions. Show:

- Heaviest completed working set per exercise where load is recorded.
- Epley estimated one-rep max for loaded working sets of 1–10 reps.
- Training milestones derived from actual completed-session data, without game mechanics.

### Local settings

Keep a small local settings record for values that must persist, such as the user's preferred rest duration if this is later exposed. The v1 weight unit and visual theme are fixed and do not need editable settings.

## Architecture and boundaries

- **Client:** Expo and React Native Android app using the existing Expo Router and TypeScript setup.
- **Persistence:** Expo SQLite is the source of truth for exercises, routines, active/completed workouts, sets, and import/export metadata. Use schema versioning and explicit migrations from the first schema.
- **Application logic:** Keep set-completion behavior, workout lifecycle, PR calculations, progress aggregation, and import validation in typed modules outside route files. Screens should coordinate presentation and actions rather than contain database rules.
- **Data access:** Use a small repository/data-access boundary so UI components do not build SQL queries directly. Use parameterized/prepared queries for user-entered values and transactions for multi-record workout updates, record recalculation, and replacement imports.
- **Integrity:** Use stable IDs rather than exercise names as identifiers. Preserve workout exercise/set snapshots for historical display even after a library exercise is renamed, recategorized, or archived. Validate numeric inputs and keep all derived summaries verifiable from underlying workout records.
- **Navigation:** Expo Router file-based routes, with primary tabs and nested stack flows.
- **Notifications:** Local notifications only for rest timer completion. No push tokens or remote notification service.
- **Files:** Use Expo-compatible local file/document picker and sharing APIs for JSON backup and restore.
- **Network:** No runtime server dependency for core features. All workout logging and history must work offline.
- **Native project management:** Keep native behavior in Expo config and config plugins; do not hand-create or edit generated `ios/` or `android/` directories.

### Expo version constraint

The repository currently declares Expo `~58.0.19` and React Native `0.88.0`. Before adding or using Expo, EAS, or React Native APIs, consult the SDK 58 docs and the Expo documentation index, per `AGENTS.md`. Add Expo modules with `npx expo install <package>` so compatible versions are selected. SQLite, Notifications, FileSystem, and DocumentPicker must be checked against the SDK 58 docs at implementation time.

## Workout rules and edge cases

- Autosave edits as they occur; a workout can be recovered after app termination or device restart from persisted active state.
- Store timer end time, not only a decrementing in-memory counter. On resume, derive remaining duration from the current time. Cancel or replace a scheduled timer notification when the timer is restarted, extended, skipped, or the workout ends.
- If notification permission is unavailable or denied, the in-app timer still counts down while the app is open and displays an ended state when the user returns.
- Keep set input numerical and easy to edit; do not make a decorative element part of the logging interaction.
- A deleted/skipped workout exercise must not silently erase already entered sets unless the user explicitly confirms discarding them.
- Editing/deleting a completed workout must update workout history, PRs, e1RM trends, and milestones consistently.
- Import must validate format version, required fields, IDs/relationships, and allowed value types before modifying the database. Apply replacement atomically so a failed import leaves the current database intact.
- Exported files contain workout and exercise history. Avoid including unrelated device information.
- The app must explain that clearing app storage or uninstalling can remove local data; users should export backups they want to keep.

## Design direction

Combine the strongest parts of the Blacksmith's Forge and Medieval Tavern, supported by restrained elements from the Gothic Fortress and Royal Archive.

- **Base surfaces:** charcoal, near-black timber, dark iron, and weathered stone.
- **Starting color tokens:** Background `#101113`; Surface `#191A1D`; SurfaceElevated `#242326`; Stone `#343338`; Iron `#4A494A`; AntiqueGold `#B69A68`; Ember `#9A4932`; Crimson `#702E36`; Parchment `#D4C7AC`; MutedText `#96918A`. Treat these as a starting palette to validate for contrast on device, not immutable values.
- **Accents:** restrained ember/amber and muted bronze for primary actions and emphasis; use crimson sparingly for destructive actions or exceptional records. Gold is an occasional highlight, never the dominant color.
- **Text:** high-contrast, readable body text and especially clear numerical weights, reps, timers, and chart labels. Use display typography for headings only; do not compromise legibility in the logging form.
- **Typography:** pair a refined historical serif for titles and section headings with a highly readable sans-serif for controls, exercise names, weights, repetitions, tables, and charts. Never use decorative type for numeric data.
- **Materials:** convey medieval character through borders, silhouettes, iconography, and a few focused illustrations. Use light stone grain, fine metal borders, dark wood accents, and restrained candlelit gradients selectively. Avoid full-screen textures and ornamental detail behind data.
- **Screen character:** Dashboard/The Hall may feel like a tavern or fortified hall; Workout/The Forge uses the most functional iron-and-ember treatment; Routines/The Armory uses compact dark timber-and-iron panels; Progress/The Chronicle uses a selective archive/ledger treatment; the overall shell may use restrained gothic architecture. The Fallen Cathedral is only an occasional decorative influence, not a screen mode.
- **Tone:** sophisticated fitness tool with subtle medieval terminology and atmosphere; no cartoon fantasy characters, quests, or RPG stats.
- **Interaction priority:** large practical tap targets, minimal steps to enter/complete a set, consistent navigation, and clear empty/error states.
- **Asset/performance rule:** texture and illustration assets must not compromise contrast, touch input, startup, scrolling, or workout logging. Keep the Forge screen especially spare. If an asset fails, all workout functionality remains usable.
- **Design review:** review individual screens at readable resolution; a promotional collage alone is not sufficient to validate detailed layouts.

## Screen-by-screen product specification

### Dashboard — The Hall

- Show the current date, a settings shortcut, and an optional small emblem; do not require a personal profile or display name.
- Make Start Workout prominent; include quick access to the last-used routine and resume when a session is active.
- Calculate total completed workouts, workouts this week, recorded training volume where compatible, and record count from stored data. Do not show a streak counter.
- Show recent workouts with date, duration, exercise count, and notable records/milestones. Tapping a workout opens its detail.
- Preview weekly activity, recent records, and a link to Progress. Empty state guides the user to start a blank session or create a routine.

### Workout Tracker — The Forge

- Record the workout start time. Keep it active across navigation and app restarts; resume without data loss.
- Exercise picker supports name search, muscle-group, equipment, and category filters, recently used exercises, and custom exercises. Clearly indicate selected exercises.
- Support adding, reordering, and removing exercises during an active session. Removing an exercise must preserve its saved sets/history as an omitted entry; routine templates remain unchanged.
- Sets have independent editable values. Never assume all sets for an exercise share weight or reps. Add/remove sets at any time. Use working/warm-up classifications in v1; set notes are optional.
- Show the most recent actual performance for each exercise and a truthful empty state when there is no history.
- Timer provides visible countdown, start, pause, reset, adjustable duration, optional per-exercise defaults, and the agreed automatic 90-second start after set completion. Allow users to adjust a running timer. Notify on completion in background where allowed.
- Support loaded reps and bodyweight reps, including optional added load or assistance. Timed and distance types are deferred (see scope reconciliation).
- Finish explicitly; an incomplete or abandoned session must not silently appear as a completed workout. Completion shows session duration, exercises, completed sets/reps, compatible recorded volume, records, and milestones.
- Use functional dark panels, metallic separators, and restrained ember accents; no large art or decorative background behind set tables.

### Routines — The Armory

- Search or sort the routine list. Cards show name, optional description, exercise count, planned sets, and last-used date when available.
- Create, rename, duplicate, delete-after-confirmation, and edit routines. Add/remove/reorder exercises; configure target sets, rep ranges, optional target load, optional rest duration, and notes.
- Starting a routine creates a separate workout snapshot. Modifying the active workout must not mutate the routine. Editing routines must never alter historical workouts.

### Progress — The Chronicle

- Select an exercise to inspect historical weight/reps, best performance, applicable e1RM, time-period progression, and comparisons with recent sessions.
- Track distinct records where meaningful: highest external load, repetition record at a given load, estimated 1RM, and highest compatible session volume. Keep exercise metrics separate; do not compare a bodyweight movement to a barbell lift by raw load.
- Calculate compatible resistance exercise volume as the sum of recorded load × reps across completed working sets. Label it “recorded training volume,” not physiological workload. Handle bodyweight/assisted cases separately; do not fold them into external-load volume.
- Show workouts per week and month, total completed workouts, actual training consistency, and optional muscle-group distribution. No streak-pressure presentation.
- Provide relevant exercise/date/routine/muscle-group filters and weekly/monthly views with labeled axes and units. Use consistent local calendar boundaries for week/month summaries.
- Use archival/ledger cues selectively; keep data more prominent than decoration.

### Library and data management

- Include primary/secondary muscle groups, equipment, tracking type, optional instructions, custom flag/source, and stable ID on each exercise.
- Custom exercises use the same logging and history features as built-in exercises. Names may collide or change; IDs and historical snapshots preserve identity and readable history.
- Settings/data management is accessible from the Dashboard. v1 exposes relevant rest-timer/notification and JSON backup controls, but no theme, unit, cosmetic, or profile-image settings.

## Progress and achievement calculation rules

- Only completed workouts and completed working sets contribute to completed training summaries, PRs, e1RM, volume, and workout-count milestones. Warm-up sets remain visible in workout history but do not contribute to these calculations.
- **Heaviest set:** maximum recorded external load for that exercise.
- **Repetition record:** most reps at a recorded external load; key the record to the exercise and load so different weights are not conflated.
- **Estimated 1RM:** Epley estimate for loaded working sets of 1–10 reps, using the recorded load and reps. Do not estimate bodyweight-only or assisted sets as if external load were equivalent.
- **Training volume:** sum of load × reps for compatible loaded working sets. Session/exercise volume records are optional where the exercise supports this measure.
- **Milestones:** first completed workout, first PR, completed-workout counts such as 25 and 100, exercise-specific records, and historical consistency milestones. Conditions must be transparent, awards idempotent, and no condition should reward unsafe/excessive training.
- **Recalculation:** after editing/deleting a completed workout, update history-derived records, counts, trends, volume summaries, and earned-state presentation from source workout data. Preserve auditable underlying logs.

## Accessibility, performance, and data integrity requirements

- Keep touch targets accessible and logging actions low-interaction; avoid unnecessary navigation during workouts.
- Maintain sufficient contrast and readable text scaling. Do not rely on color alone for set completion, PR state, errors, or other status.
- Label controls and charts; show readable axis labels and units.
- Keep animations subtle and off the critical logging path. Avoid unnecessary renders and eagerly loading large decorative assets. Charts must remain responsive as history grows.
- Validate load, reps, duration, distance (when later implemented), notes, and imported data. Preserve active sessions over app restarts; prevent duplicate achievements; confirm destructive operations.
- Keep the workout tracker usable offline and if decorative assets fail.

## Phased implementation roadmap

### Phase 1 — Foundation and usable workout loop

- Confirm the SDK 58-compatible package choices and current Expo Router guidance.
- Establish app theme tokens, navigation shell, reusable field/button/card primitives, Android system-bar styling, and reviewable screen layouts.
- Add SQLite initialization, versioned schema, migrations, and a starter built-in exercise catalog.
- Build Dashboard, exercise selection/search/filter, previous-performance display, blank workout flow, independent set entry/completion, timer, autosave/recovery, workout summary, and basic completed-workout history.
- Keep this phase buildable and usable on a physical Android device before adding analytics breadth.

### Phase 2 — Routines and library management

- Add searchable/filterable exercise library and custom exercise create/edit/archive.
- Add routine list/search, creation, editing, duplication/deletion, exercise ordering, set-count/rep-range targets, optional target loads/rest values, and notes.
- Start a workout from a saved routine and allow in-session exercise changes while retaining logged sets.

### Phase 3 — History, records, and analysis

- Add workout history detail and completed workout edit/delete.
- Add derived heaviest-load, rep-at-load, compatible volume records, Epley e1RM, strength/frequency trends, filters, completion summaries, and understated milestones.
- Ensure derived results recompute after any change to completed workout data.

### Phase 4 — Data portability and release polish

- Implement versioned JSON export/import and safe replacement workflow.
- Polish empty, permission-denied, validation, accessibility, asset-failure, and other failure states.
- Verify performance and usability on a physical Android device and resolve issues before v1 sign-off.

## Acceptance criteria

- A user can start a blank workout or a workout from a routine, add exercises, log and complete warm-up and working sets, adjust the rest timer, finish, and find the session in history.
- A killed/reopened app restores the current active workout and its entered sets without duplicates or loss.
- A set completed while a notification is scheduled produces a timer alert in the background when permission and Android behavior allow it; the timer remains usable when permission is denied.
- The exercise library contains built-in and user-created entries and supports search plus muscle-group and equipment filters.
- A routine can be edited, duplicated, and deleted safely; starting it does not mutate the routine, and historical workouts remain unchanged after routine edits.
- Routines support ordered exercises, target set counts, rep ranges, and editing.
- Warm-ups do not affect records. Working-set PR and e1RM calculations follow the rules above.
- Editing or deleting a completed workout recalculates history-derived results correctly.
- Valid JSON can be exported and restored after preview/confirmation. Invalid JSON, cancellation, or a failed replacement leaves existing data unchanged.
- Dashboard and Progress aggregates are derived from saved data; volume and records clearly distinguish compatible loaded movements from bodyweight/assisted movements.
- Core controls meet contrast and touch-target expectations; information is not conveyed by color alone, and workout logging remains usable if decorative assets fail.
- Test key flows on a physical Android device. Run `npx expo lint` and `npx tsc --noEmit` before declaring v1 done. Add focused automated tests for data/domain logic and import validation; test UI and notification permission behavior on device.

## Assumptions and unresolved risks

### Assumptions recorded from the interview

- The initial exercise catalog will be curated during implementation; its exact contents and illustration set are not selected yet.
- Bodyweight-only sets store reps with no load; optional load means added external load. There is no body-mass profile in v1, so bodyweight-only sets do not produce load-based e1RM values.
- Use Epley as the agreed e1RM formula, only for recorded working-set loads and rep counts from 1 through 10.
- When import is selected, show a preview and require confirmation before replacing all local data; no record-merging behavior is required in v1.
- Use the recommended 90-second rest duration as the default. Allow duration adjustment before/during a timer.
- The app is initially for personal Android testing, not a public store launch. No backend or production account setup is planned for v1.
- The detailed specification's optional bodyweight assistance field and set notes are included as lightweight v1 extensions; assistance is kept separate from added load in records and volume.
- Record categories include highest load, reps at a given load, compatible volume, and Epley e1RM. These are applied only to compatible exercise/set types.

### Reconciliation with the detailed specification

The interview contains explicit v1 choices that narrow some options in the longer design sheet. Keep the interview choices authoritative for v1 and retain the broader ideas below as future-version references:

- The design sheet proposes kg/lb, distance units, and selectable appearance; v1 remains kg-only with one dark theme and no cosmetic customization.
- The design sheet proposes timed holds and distance tracking; v1 logs loaded/bodyweight repetitions. Keep the exercise tracking type extensible so duration/distance can be added later without forcing every exercise into reps.
- The design sheet proposes a Profile/Legacy page, profile image/emblem, cosmetic rewards, and settings for units/themes. v1 has no dedicated profile tab or required personal details; milestones live under Progress and settings/data management are reached from the Dashboard.
- The design sheet mentions consistency and streaks; v1 can report factual workout frequency and milestone history but must not show streak pressure.
- The design sheet proposes optional auto-start behavior for rest timers; the interview selected automatic timer start on set completion with a 90-second default. Keep timer duration adjustable, but do not require a setting to enable the selected behavior.
- The design sheet includes drop-set types and optional target weights/rests. Target load and rest are supported as optional routine guidance; v1 set classifications remain warm-up and working. Treat drop-set classification as a later extension unless required by implementation evidence.
- The design sheet suggests a separate achievement notification/profile collection. v1 may show concise milestone feedback and earned milestones in Progress, without cosmetic rewards or a separate profile area.

These resolutions prevent the merged document from silently expanding the first release while preserving the full specification's useful direction.

### Risks to manage

- Local-only storage can be lost if app storage is cleared or the app is uninstalled. JSON export mitigates but does not eliminate this risk.
- Android notification permission, battery behavior, and OS scheduling can affect background timer alerts. In-app timer recovery must remain correct without notifications.
- Epley is an estimate, not a measured maximum; avoid presenting it as exact strength. Very high-rep sets are excluded from e1RM.
- Deleting/editing history requires reliable recalculation so no stale records or milestones remain.
- No specific performance target, deadline, automated CI setup, or public-release requirements were decided in the interview; revisit if the project moves beyond personal device testing.

## Repository starting point

- `src/app/_layout.tsx` currently renders a basic Expo Router `Stack`.
- `src/app/index.tsx` is a placeholder screen.
- `package.json` declares Expo `~58.0.19`, React Native `0.88.0`, TypeScript, and Expo Router; no workout database, authentication, or feature dependencies are currently present.
- `AGENTS.md` requires mobile-first implementation, Expo SDK versioned documentation, Expo Router routes in `src/app/`, no hand-edits to generated native directories, Expo-compatible package installation, and lint/typecheck before implementation work is declared complete.
