# Households, step 2 (editing families) — design (2026-11-27)

## Intent

The owner wants to build families on a phone, starting with "Chapelboro - T107.08BG2 - Whispering Hills": "mostly phone. keep it that way". Editing comes before SRP household writes exist (owner, via cluster-notebook). Edited households wait for SRP.

## Decisions

- **Tap actions, no drag** (owner, 2026-11-27).
- **Backend (cluster-notebook proposal, provisional until the owner approves theirs):**
  - `createHousehold(contactId, memberIds: [String!])` is atomic. Any refusal creates nothing.
  - `addHouseholdMember(householdId, individualId, fromHouseholdId: String)` moves someone between families atomically when `fromHouseholdId` is given.
  - `removeHouseholdMember(householdId, individualId)`. Removing the last other member leaves a household of one, and removing the only member dissolves it.
  - `setHouseholdContact(householdId, individualId)`.
  - Each returns the Household.
  - **Codes:**
    - `ALREADY_IN_HOUSEHOLD`
    - `NOT_IN_HOUSEHOLD`
    - `NOT_A_MEMBER`
    - `CONTACT_MUST_STAY`
    - `DIFFERENT_PLACE`
    - `FORBIDDEN`: the caller must be allowed to move each person touched.
  - `Household.srpState: IN_SRP | WAITING | LOCAL_ONLY`, wherever a Household appears.
- The move warning from step 1 is unchanged.

## What a user can do (Families card, phone first)

Editing shows only to callers with `canWrite` on the nucleus. The server's FORBIDDEN is still handled.

1. **A family, expanded**, shows each member with:
   - **Make contact**, for non-contacts;
   - **Remove**. The contact's Remove is disabled, with the note "To remove <name>, make someone else the contact first." The exception is when they're the only member.
2. **"Add someone…"** in an expanded family opens a picker.
   - It lists the nucleus's people not already in this family.
   - It has the card's search and its Family name / Address sort.
   - Each row shows the person's current family, if any.
   - Picking someone with no family adds them.
   - Picking someone in another family asks "Move <name> from the <family> household?", then sends `addHouseholdMember` with `fromHouseholdId`.
3. **"Start a family with…"** on a one-person entry opens the same picker.
   - The picked person joins.
   - The tapped person becomes the contact.
   - It sends `createHousehold(contactId, [picked])`.
   - Picking someone already in a family offers to move them, as above, by removing them from that family and then creating this one. Builder's call: if the backend can't make this atomic, offer only people with no family here and say so.
4. **A badge on the family row:**
   - `WAITING` shows "Waiting for SRP".
   - `LOCAL_ONLY` shows "Only in Nucleus Assistant".
   - `IN_SRP` shows nothing.
5. **After any change,** the list re-reads, so sort, counts and badges stay right. The People card's household data refreshes too.
6. **Refusals** are shown in plain words next to the family:
   - `CONTACT_MUST_STAY`: "Make someone else the contact first."
   - `ALREADY_IN_HOUSEHOLD` / `NOT_IN_HOUSEHOLD`: "<name>'s family changed. The list has been refreshed; try again." The list re-reads.
   - `DIFFERENT_PLACE`: "<name> lives somewhere else. Move them here first (People card)."
   - `FORBIDDEN`: "You can't change this family."

## Non-goals (step 2)

- **No drag and drop.**
- **No in-card "Move here first".** For now `DIFFERENT_PLACE` points to the People card. This never arises in Whispering Hills, where everyone is at the same place.
- **No SRP household writes,** and no conflict resolution when SRP's own screens change a household. That's later.
- **No building or street grouping.**

## Approaches

- **Tap actions in the expanded family, with a picker (chosen).** They fit the phone and reuse the card's search and sort.
- **Drag and drop:** rejected, because it's fiddly on phones.
- **A separate "edit family" screen** (the mockup's step-2 board): folded into the expanded row instead, so the user stays in the list. The mockup's actions are kept.

## Left to the builder

- **Picker form:** a bottom sheet or an inline panel, at least 44px targets, using `createPortal` if it overlays a card.
- **Optimistic update or wait-and-refresh.** Builder's call: wait for the server, then re-read, because these are rare actions.
- **Where the error copy lives:** a tested `lib/households.ts` mapping.
