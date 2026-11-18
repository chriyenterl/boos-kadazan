# Boos Kadazan

Bite-size lessons in **Coastal Kadazan** (Boos Kadazan), the language of Penampang, Papar and Membakut in Sabah, Malaysia.

13 units and 30 lessons: greetings, introductions, numbers, language help, family, everyday words, celebrations (including Kaamatan), getting around, food, the body, colours, animals and nature. Exercises include new-word cards, multiple choice, matching pairs, sentence building and typing, with XP, a daily goal, a day streak and practice rounds. Tapping an answer checks it straight away, and a right answer moves on by itself.

A speaker button reads each Kadazan word aloud using the device's Malay (or Indonesian) voice, with the spelling adjusted for glottal stops and double vowels. It is a close guide, not a native speaker. Progress is saved in each learner's own browser.

The whole app is one file, `index.html`, with no build step.

## Friends

Learners can pick a display name to get a 6-character friend code, add friends by code or invite link, and see a weekly leaderboard with each friend's streak, XP and lessons done.

This uses a small server in [`worker/`](worker/) running on Cloudflare Workers with a D1 database. It stores only a display name, friend code, XP, streak, lessons done and this week's XP. Anyone with a learner's code can read that, and only the learner's own device (which holds a secret) can change or delete it. The server only accepts browser requests from this site, and limits each network to 20 new codes a day.

To deploy changes to the server: `cd worker && npm install && npx wrangler deploy`.

## Sources

- [Useful phrases in Coastal Kadazan](https://omniglot.com/language/phrases/coastalkadazan.htm), Omniglot (phrases by Lesley Housten C Kibat and Dr Francis Paul)
- [Numbers in Coastal Kadazan](https://www.omniglot.com/language/numbers/coastalkadazan.htm), Omniglot (compiled by Lesley Housten Kibat)
- [Family words in Kadazandusun](https://www.omniglot.com/language/kinship/kadazandusun.htm), Omniglot
- [Coastal Kadazan language](https://en.wikipedia.org/wiki/Coastal_Kadazan_language), Wikipedia
- [Coastal Kadazan entries](https://en.wiktionary.org/wiki/Category:Coastal_Kadazan_lemmas), Wiktionary
- [Kadazan Dusun word list](https://acd.clld.org/languages/287), Austronesian Comparative Dictionary

Spellings vary from village to village. If your family says a word differently, go with your family.
