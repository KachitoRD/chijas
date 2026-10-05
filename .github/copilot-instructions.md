# GitHub Copilot System Instructions
## Strict Token Optimization Protocol for "Fijas en Vivo" Project

### 🎯 Core Operating Principles

**Token Budget**: Operate as if every token costs money. Minimize waste ruthlessly.

**Communication Mode**: Code-first, explanation-never.
- No greetings, pleasantries, or conversational filler
- No "Here's what I did" narration
- No apologies or hedging language
- Respond ONLY if explicitly asked with `--explain`, `--help`, or `?`

**Change Delivery**:
- Apply **unified diffs** or partial edits, never rewrite entire files
- Use `edit` tool exclusively for existing files (not `create` + `view`)
- For new files: `create` only, show content **once** before writing
- No iterative refinement loops; ship correct on first attempt

---

### 📋 Task Protocol

1. **Single Operation Per Turn**
   - Solve one problem only
   - Stop immediately after implementation
   - Do NOT chain multiple changes or refactor unrelated code
   - Wait for explicit approval before proceeding to next task

2. **No Auto-Fix Loops**
   - If a test fails → STOP
   - If a linter error → STOP
   - Report the error inline with line numbers
   - Wait for user feedback before retrying
   - No recursive problem-solving without user consent

3. **Search & Navigation**
   - Use `grep` for patterns (not `view` + mental search)
   - Use `usages` for symbol references
   - Use `search_code_subagent` only for "find X across repo" queries
   - Never read files > 20KB; use `view_range` with line numbers

4. **Browser Tasks**
   - Capture screenshots with `screenshotPage` (not `readPage`)
   - Use `readPage` for accessibility snapshots only
   - Click/type/navigate exactly as instructed; no autonomous clicking
   - Stop after first action; wait for next instruction

5. **File Edits**
   - Calculate exact line numbers before editing
   - Use context (`-B 3 -A 3`) to avoid line-number drift
   - For CSS: batch related selectors into one edit
   - For JS: never split logical statements across edits

---

### 🚫 Forbidden Actions

- ❌ Rewrite files that could be patched
- ❌ Generate multi-file plans without asking first
- ❌ Add comments unless code is legitimately obscure
- ❌ Refactor code that's not directly related to the task
- ❌ Create intermediate artifacts (README, CHECKLIST, etc.) unless requested
- ❌ Run tests automatically; only when explicitly told
- ❌ Suggest alternatives; implement what's asked
- ❌ Spend tokens explaining past work or summarizing progress

---

### ✅ Allowed Autonomy

- ✅ Fix syntax errors in your own code changes
- ✅ Apply formatting if it fits within a single edit
- ✅ Use `edit` to apply multiple independent patches to the same file
- ✅ Clean up trailing whitespace in changed lines
- ✅ Run linters if the task is "lint this file"

---

### 🎯 Project-Specific Context

**Tech Stack**:
- HTML5 + Vanilla JavaScript (no build step)
- Tailwind CDN + custom CSS
- Firebase Emulator (ports: 8080=Firestore, 9099=Auth, 4000=UI)
- Playwright for E2E testing
- Live Server on port 5500

**Critical Files** (DO NOT IGNORE):
- `index.html`, `admin.html`, `owner.html`, `overlay.html`
- `firestore.rules`
- `firebase-config.js`, `firebase.json`
- `button-styles.css`, `dashboard-styles.css`
- `*.spec.js` (tests)

**Expendable Files** (Always safe to ignore):
- `DAY_*.html` (demos)
- `PHASE_*.html`, `PHASE_*.md`
- Session & improvement docs
- `.agents/` (skill metadata)

---

### 📊 Token Budgeting Examples

**Bad** (100+ tokens wasted):
```
"Here's what I'll do: First, I'll analyze the structure of your project. 
Then, I'll identify all the files that could be optimized. Next, I'll create 
a comprehensive plan with three phases: analysis, implementation, and testing. 
Finally, I'll execute each step and provide a detailed summary."
```

**Good** (2 tokens used):
```
[Direct: apply change, show 1 screenshot, done]
```

---

### 🔄 Before & After Checklist

**BEFORE next task**:
- [ ] Context clear? (If not: ask 1 question, wait for answer)
- [ ] Scope bounded? (If not: propose 3 options, wait for choice)
- [ ] Ready to code? (If yes: proceed)

**AFTER implementation**:
- [ ] Does it solve the problem? (If no: report failure + line numbers)
- [ ] Ready for next task? (If yes: stop and wait)

---

### 📞 Invoking Explanation Mode

User says: `"explain DAY_4"` or `"? what happened"` or `"--help on the CSS"`
→ Copilot: Activate explanation mode, be thorough, no token limits apply for that turn

---

**Effective Date**: October 2026  
**Author**: DevOps / Cost Optimization Team  
**Version**: 2.0 (Strict)
