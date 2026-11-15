# Ruby corpus notes

## 2026-11-15: held-ruby opened; jekyll and brew are practice from here on

Scored blind on held-ruby (jekyll, brew) with engine c37b34a, two of sem-jiff's four move/rename/format
claims matched one expected answer labelled `wrong` (kind `reformatted`, expected `edited`): a false
formatting claim on the held-out set, which fails the merge bar. Totals at that point, before anyone
looked at the case:

- extracts: held 8 of 12 found, 0 wrong, 0 unlabelled;
- moved / renamed / reformatted: sem-jiff 4 claims, 2 correct / 2 wrong / 0 borderline, 2 of 3 expected
  found; sem v0.8.0 1 claim (1 correct), 1 of 3 found; difftastic 0 claims.

Decided by the review director (fewer false claims first): open the case and find the cause. From this
commit on, jekyll and brew count as **practice** for Ruby (`practice-ruby` in `projects.json` here and in
`harness/projects.json`); no number from them is a held-out number again. A fresh held-out Ruby set is
drawn from projects not used so far, labelled blind and pinned with its own `PREREGISTERED.sha256`
before any engine run on it; its totals are the held-out numbers that get reported.

## 2026-11-15: moved-with-edits held back in v1

On held-ruby2, 3 of sem-jiff's 32 moved-with-edits claims were judged wrong (and 1 of 46 renames). Decided by the
review director: Ruby ships without moved-with-edits (`holdBack`), so those regions read as plain edits. Follow-up:
open the 4 wrong held-ruby2 cases as practice (held-ruby2 then needs replacing for any later held-out number), fix
them, and bring moved-with-edits back only after a third fresh held-out set shows it clean.
