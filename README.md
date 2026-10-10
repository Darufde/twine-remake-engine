# 📖 Story Builder

Make choose-your-own-adventure stories like **Twine**, without writing any code.

Everything SugarCube can do with code (stats, inventory, if/else, choices that change things) is a **button** here. You fill in a little form, and Story Builder writes the SugarCube code for you.

## How to start

1. Download this project (on GitHub: green **Code** button → **Download ZIP**) and unzip it.
2. Double-click **`index.html`**. It opens in your web browser. That's it: nothing to install.

> Your stories save automatically **in that browser**. To keep a safe copy, or to move a story to another computer, use **Export → Backup (.json)**. Load it again with **Open a backup**.

An example story, *The Locked Castle*, is included so you can see how everything works.

## The pieces

| Thing | What it is |
|---|---|
| **Passage** | One page of your story. Each card on the map is a passage. Click to edit, drag to move, double-click empty space for a new one. |
| ⭐ **Start** | The passage readers begin on. |
| **Arrows** | Show where choices lead (dashed = automatic jump). |

### Block buttons (instead of SugarCube code)

| Button | Does the same as SugarCube… |
|---|---|
| 📝 **Text** | normal passage text. **B** / *I* for bold/italic; "Show a stat" inserts `{gold}` to show a value |
| 🔀 **Choice** | `[[link]]` / `<<link>>`: a button to another passage. It can also change stats or give items when clicked |
| 🔢 **Change a stat** | `<<set $gold += 5>>` |
| 🎒 **Give / take item** | adding/removing an item in an inventory list |
| ❓ **If… (condition)** | `<<if>>` / `<<elseif>>` / `<<else>>`, with conditions like "gold is at least 3" or "inventory contains Key" |
| 🎲 **Random number** | `<<set $roll to random(1, 6)>>` |
| ➡️ **Jump to passage** | `<<goto>>` |

### 📊 Stats & Items

Stats are what your story remembers:

- **Number**: gold, health, score
- **Words**: a name
- **Yes / No**: did they open the door?
- **List / Inventory**: a bag of items

Tick **Show to player** to show a stat in the sidebar while playing.

## Playing and sharing

- **▶ Play** tests your story right away. **Play from here** starts from any passage.
- **Export → Playable game (.html)** makes one file anyone can double-click to play.
- **Export → Twine 2 file (.html)** makes a file for real Twine 2 (*Library → Import*). It uses the **SugarCube 2** story format, so everything keeps working there.
- **Export → Twee (.twee)** makes a plain-text story file for Tweego and other Twine tools.
- Click **👀 Peek at the SugarCube code** under any passage to see the code it makes (optional, but a nice way to learn).

## Project files (for the curious)

```
index.html        the app page
css/app.css       how it looks
js/model.js       story data and saving
js/editor.js      story map and passage editor
js/compile.js     turns blocks into SugarCube code and builds exports
js/player.js      plays stories (also built into the playable export)
js/ui.js          pop-up windows and helpers
js/app.js         My Stories screen, play, help
```
