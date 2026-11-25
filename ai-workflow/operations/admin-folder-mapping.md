---
name: admin-folder-mapping
description: Plan and carry out a company file-structure clean-up or merge in Google Drive (My Drive into a shared drive, consolidating owners, handing over a leaver's files). Use when someone asks to tidy, restructure, map, merge or hand over Drive folders, set up an admin folder structure, or move files into a shared drive.
---

# Admin folder mapping

Turns a messy set of company files into one structure people can find things in, without breaking the links, apps and automations that already point at those files. Written from a real handover, where a departing systems owner's My Drive was cleaned up and merged into the director's shared drive.

## Principles

1. **Map into the structure that already exists.** If the business owner has a shared drive with their own folders, file into those. Don't impose a new top level. Your clean-up folders become sources, not destinations.
2. **Move, never copy.** A move keeps the file ID, so every link in docs, guides, bookmarks, emails and code keeps working. A copy makes a second version and breaks links.
3. **Never touch what an app writes to.** Folders a tool saves into by ID (job folders, certificates, signature logs) stay exactly where they are. Find them first (search the code and env var names: `*_FOLDER_ID`, `*_PARENT_ID`, Apps Script bound sheets) and mark them do-not-move.
4. **Credentials never go into a shared drive.** Files with passwords or keys go into the vault, then the bin. Moving them into a shared drive widens who can read them.
5. **People decide what's deleted.** Bin only on an explicit yes, and only empty or exact-duplicate items. Prefer Bin over permanent delete.
6. **Verify every move with an API read**, not the UI. The UI often shows stale state for 10+ seconds.

## Process

### 1. Inventory
- List the source tree with `'<folderId>' in ancestors` (pages are short; follow `nextPageToken`, dedupe IDs).
- Record per item: id, title, type, owner, `canEdit`, `canMoveItemWithinDrive`, last modified.
- Flag: files the source account does not own (they may not move), app-written folders, credentials, duplicates, empties.

### 2. Map
Build a two-column table, source to destination path, and show it to the person before moving anything. Match by job, not by name:

| Kind of content | Usually goes to |
|---|---|
| SOPs, manuals, handbooks | Operations |
| Handover pack, system docs, tool guides | Operations > Systems & Tools |
| Asset lists, QR codes, fleet data | Operations > Fleet / Assets |
| Task trackers | Operations > Live Ops |
| Per-event or per-job folders | Deployments / Jobs |
| Leads, CRM exports | Sales > Pipeline |
| Market research | Sales (top level) |
| Pitches, brochures, video | Brand & Marketing |
| Reports, weekly updates, assessments | Brand & Marketing > Presentations > Internal Updates (or Admin > Reports) |
| Invoice and PO templates | Finance > Invoices & Revenue |
| Contract redlines, agreements | Legal > the matching agreement folder |
| Archive, duplicates, superseded material | Admin (or an Archive folder inside it) |

Keep the source's top-level numbering (01, 02...) out of the destination unless the destination uses it.

### 3. Check permissions before you start
- Moving **folders** from My Drive into a shared drive needs the mover to be **Manager** on that shared drive. Contributor or Content manager shows destinations greyed out in the Move dialog.
- Check with the API: on the destination folder, `canAddChildren: true` but `canMoveItemWithinDrive: false` means not Manager yet. `get_file_permissions` on a destination folder shows `role: organizer` once Manager is granted (capabilities can lag a few minutes behind).
- Ask the drive owner to change the role in the shared drive's Manage members. Don't work around it by recreating folders, which changes IDs.

### 4. Move
- **Files:** the Drive connector's `update_file` with `parentId` works into a shared drive.
- **Folders:** the connector refuses (`The caller does not have permission`) even with Manager. Use the Drive web UI: select the row, right-click, Organise, Move. In the dialog, open search and paste the destination folder's URL (the first keystrokes are often dropped, so type a character, click the box again and paste). Pick the result, press Move (often needs a second press after "Loading"), then confirm the "Move to X?" dialog. It lists the item count, says the shared drive becomes owner, and says drive members gain access.
- Don't navigate away while the "Moving..." toast shows. That cancels the move.
- Several folders with the same destination: select them together (cmd-click) and move once.

### 5. Verify
- After each move, `get_file_metadata` and check `parentId` and `sharedDriveId`.
- At the end, list the source tree again. Expected: only empty shells. Then search for the awkward items (non-owned files, old sign-off folders) by title and confirm each is in the destination.

### 6. Tidy and document
- Put a **shortcut** to any live log or sheet that must stay put (for example an app-written audit sheet) in the handover folder, so people find it without moving it.
- Ask before binning the empty source shell.
- Update every doc that names a path: the leaver checklist (add a "where the files are" table), the system overview (add a "where the files are" section) and any tool guide that says "edit the sheet" without saying where it is.
- If there is a staff portal, add a tile for the shared drive (see [`staff-portal-architecture`](staff-portal-architecture.md)).

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Destination greyed out in Move dialog | Mover is not Manager | Owner changes role, wait a few minutes, retry |
| Connector "caller does not have permission" on a folder | Connector can't move folders into shared drives | Use the Drive UI |
| Context menu opens then vanishes | Drive UI focus quirk | Click the row first, then right-click; use the element ref for Organise and Move instead of coordinates |
| Move "done" but item still in source | Page was reloaded mid-move, or confirm click missed | Re-check with the API, redo the move |
| A link stopped working | Item was copied or recreated, not moved | Find the original, move it, update links |
| Trash refused | A safety rule or a missing permission | Get an explicit yes from the person; never force it |

## Acme Hire example map

Destination: the company shared drive (owned by the operations director). The shared admin mailbox is Manager.

| From the shared admin mailbox's My Drive | To |
|---|---|
| Manuals and SOPs | Operations |
| Operations Handover | Operations > Systems & Tools |
| Assets and equipment (Asset Master Database) | Operations > Fleet Register |
| Operations Tasks sheet | Operations > Live Ops |
| Jobs and events | Deployments |
| Leads and trackers, CRM exports | Sales & Commercial > Pipeline |
| Research | Sales & Commercial |
| 03 Marketing | Brand & Marketing |
| 05 Reports and strategy | Brand & Marketing > Presentations > Internal Updates |
| 99 Archive | Admin |
| Invoice Template, PO Branded | Finance > Invoices & Revenue |
| Clause 6 redline | Legal > Hire Agreements |

Do not move: shared drive "Acme Digital Storage", which the handover app and Trader Briefing write to by ID. It includes Trader Briefings > "Trader Responsibility Sign Off" (the Apps Script log); a shortcut to it sits in the handover folder.
