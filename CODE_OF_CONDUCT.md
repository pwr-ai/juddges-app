# JuDDGES App Code of Conduct

*JuDDGES — Judicial Decision Data Gathering, Encoding, and Sharing — Application*

## 1. Our Pledge

We — as members, contributors, maintainers, and leaders of the JuDDGES
application project — pledge to make participation in our community a
harassment-free experience for everyone, regardless of age, body size,
visible or invisible disability, ethnicity, sex characteristics, gender
identity and expression, level of experience, education, socio-economic
status, nationality, personal appearance, race, caste, colour, religion,
or sexual identity and orientation.

This repository hosts the **end-user application** for the JuDDGES project
— a cross-disciplinary, cross-jurisdictional collaboration between
researchers in computer science, law, and the social sciences (Wrocław
University of Science and Technology, Middlesex University London,
Université Claude Bernard Lyon 1, and partners). Because this application
is used by legal scholars, practitioners, students, and members of the
public to access and analyse judicial decisions, we hold ourselves to
particularly high standards in usability, accessibility, security, and
respect for the rule of law.

We pledge to act and interact in ways that contribute to an open,
welcoming, diverse, inclusive, and healthy community — and to uphold the
Open Science values on which the wider JuDDGES project is built.

## 2. Scope

This Code of Conduct applies within all spaces of the JuDDGES app
project, including but not limited to:

- this repository and any other repositories of the JuDDGES app
  (frontend, backend, infrastructure, deployment, documentation),
- issues, pull requests, discussions, code review, and commit messages,
- bug reports and feature requests submitted by end users,
- support channels (e.g. e-mail, chat, forums) where the team responds
  to users of the deployed application,
- workshops, user-testing sessions, demos, conferences, and other
  events organised by or on behalf of the project,
- public spaces when an individual is officially representing the
  JuDDGES app (e.g. using an official project e-mail address, posting
  from an official social media account, or acting as an appointed
  representative).

It also applies to interactions with **early career researchers (ECRs)**,
beta testers, and external collaborators that the project actively
engages.

## 3. Our Standards

Examples of behaviour that contributes to a positive environment include:

- Demonstrating empathy and kindness toward other people, including
  end users who are not technical and may be reporting issues in
  imprecise terms.
- Being respectful of differing opinions, viewpoints, and experiences —
  including across disciplines (e.g. between legal scholars, UX
  designers, and software engineers) and across legal traditions (e.g.
  Polish civil law and English common law).
- Giving and gracefully accepting constructive feedback in code review,
  design review, accessibility review, and academic discussion.
- Accepting responsibility, apologising to those affected by our
  mistakes (including users affected by bugs or outages), and learning
  from the experience.
- Focusing on what is best not just for us as individuals, but for the
  overall community and the people who depend on the application.
- Communicating in **English** in shared project spaces by default,
  while welcoming other languages in clearly-scoped working groups.
  When switching languages, please provide a short summary in English
  so that international collaborators can follow.
- Crediting the work of others — designers, translators, accessibility
  reviewers, testers, software contributors — in commits, release
  notes, and presentations.

Examples of unacceptable behaviour include:

- The use of sexualised language or imagery, and sexual attention or
  advances of any kind.
- Trolling, insulting or derogatory comments, and personal or political
  attacks — including dismissive treatment of users who report bugs or
  request features.
- Public or private harassment.
- Publishing others' private information, such as a physical or e-mail
  address, without their explicit permission. **This is especially
  serious when the information concerns a real person named in a
  judicial decision served by the application.**
- Sustained disruption of discussions, code reviews, or events.
- Plagiarism, fabrication or falsification of results, hidden conflicts
  of interest, or other forms of research misconduct.
- Other conduct which could reasonably be considered inappropriate in
  a professional or academic setting.

## 4. Project-specific responsibilities

Because the JuDDGES app exposes **judicial decisions and related legal
data** to end users, contributors are additionally expected to:

1. **Respect data protection and privacy.** Personal data appearing in
   court records (parties, witnesses, third parties, judges, lawyers,
   etc.) must be handled in line with the GDPR (Regulation (EU)
   2016/679), the UK GDPR, and any applicable national rules. Never
   commit production data, user logs, search queries, or database
   dumps containing personal data to this repository. Use synthetic or
   properly anonymised fixtures for development, tests, and demos.
2. **Do not attempt re-identification.** Do not deliberately attempt to
   re-identify individuals in pseudonymised or anonymised judgments
   served by the application, and do not introduce features whose
   primary purpose is re-identification, profiling of named
   individuals, or aggregating personal data beyond what is necessary
   for the documented research purpose.
3. **Be careful with sensitive content.** Court records may contain
   descriptions of violence, abuse, or other sensitive material. When
   designing UI, examples, screenshots, or documentation, prefer
   neutral or clearly fictional samples; warn collaborators and users
   when sharing particularly distressing examples (content warnings in
   docs, demo data, and release notes are encouraged).
4. **Build for accessibility.** UI contributions should follow
   recognised accessibility standards (WCAG 2.1 AA as a minimum
   target). Reviewers may request changes that improve keyboard
   navigation, contrast, screen-reader support, or readable typography
   — these are not optional cosmetic concerns.
5. **Do not present the application as legal advice.** The JuDDGES app
   supports research and analysis; it does not provide legal advice.
   Contributions to UI copy, documentation, or release notes must not
   suggest otherwise. Be careful, in particular, with AI-generated
   summaries, predictions, or scoring features — they must be clearly
   labelled as automated, experimental, and not a substitute for
   qualified legal counsel.
6. **Disclose AI assistance** (e.g. LLM-generated code, text, or
   annotations) where this is required by the relevant venue, journal,
   or contribution guidelines, and never present model outputs as
   verified human review without checking them.
7. **Respect terms of upstream data sources.** Court-record portals
   (e.g. BAILII, the Polish Common Courts Judgments Portal) and other
   upstream providers have their own terms of use. Do not introduce
   scraping, redistribution, or caching behaviour that violates those
   terms without explicit approval from the project leads.
8. **Acknowledge funders and partners** correctly in the application
   (about page, footer, release notes), including the CHIST-ERA / Open
   Research Area funding context where applicable.

## 5. Security disclosure

The JuDDGES app may handle non-public data and is used by real users.
Security issues are therefore handled separately from this Code of
Conduct.

- **Do not file security vulnerabilities as public GitHub issues.**
- Report suspected vulnerabilities privately, via the channel described
  in `SECURITY.md` in this repository, or — if no such file is present
  — by e-mail to the project maintainers listed in `README.md` /
  `MAINTAINERS`.
- Please allow the team a reasonable period to investigate and remediate
  before public disclosure. We commit to acknowledging reports promptly
  and keeping reporters informed of progress.
- Researchers who follow good-faith coordinated disclosure will be
  credited (with their consent) in release notes.

## 6. Enforcement Responsibilities

Project maintainers and Work Package leaders are responsible for
clarifying and enforcing the standards of acceptable behaviour and will
take appropriate and fair corrective action in response to any
behaviour that they deem inappropriate, threatening, offensive, or
harmful.

Maintainers have the right and responsibility to remove, edit, or
reject comments, commits, code, wiki edits, issues, and other
contributions that are not aligned with this Code of Conduct, and will
communicate reasons for moderation decisions when appropriate.

## 7. Reporting

If you experience or witness behaviour that violates this Code of
Conduct, please report it as soon as you can. You have several channels:

- **Primary contact (project lead, WUST):** open a GitHub issue marked
  `code-of-conduct` *only* for clearly non-sensitive matters, or
  contact the project maintainers listed in the repository `README.md`
  / `MAINTAINERS` file by e-mail.
- **Confidential contact:** for sensitive reports (harassment,
  research misconduct, data protection incidents), e-mail the project
  lead and the Work Package leader responsible for project management
  directly. Do not file these as public issues.
- **Institutional channels:** reporters may always escalate to their
  own or the respondent's home institution — for example, the Wrocław
  University of Science and Technology Ethics Commission, the
  Middlesex University Research Ethics Committee, or the Université
  Claude Bernard Lyon 1 ethics office — and this Code of Conduct does
  not replace those procedures.
- **Data protection incidents** involving personal data from court
  records or from users of the deployed application must additionally
  be reported to the relevant institutional Data Protection Officer
  (DPO) without undue delay, in line with GDPR Articles 33–34.
- **Security vulnerabilities** are handled through the channel
  described in Section 5, **not** through this Code of Conduct
  process.

All reports will be reviewed and investigated promptly and fairly. The
project team is obligated to respect the privacy and security of the
reporter of any incident.

## 8. Enforcement Guidelines

Project maintainers will follow these Community Impact Guidelines in
determining the consequences for any action they deem in violation of
this Code of Conduct:

### 8.1 Correction
**Community Impact:** Use of inappropriate language or other behaviour
deemed unprofessional or unwelcome in the community.
**Consequence:** A private, written warning from maintainers, providing
clarity around the nature of the violation and an explanation of why
the behaviour was inappropriate. A public apology may be requested.

### 8.2 Warning
**Community Impact:** A violation through a single incident or series
of actions.
**Consequence:** A warning with consequences for continued behaviour.
No interaction with the people involved, including unsolicited
interaction with those enforcing the Code of Conduct, for a specified
period of time. This includes avoiding interactions in community
spaces as well as external channels like social media. Violating
these terms may lead to a temporary or permanent ban.

### 8.3 Temporary Ban
**Community Impact:** A serious violation of community standards,
including sustained inappropriate behaviour.
**Consequence:** A temporary ban from any sort of interaction or
public communication with the community for a specified period of
time. No public or private interaction with the people involved,
including unsolicited interaction with those enforcing the Code of
Conduct, is allowed during this period. Violating these terms may
lead to a permanent ban.

### 8.4 Permanent Ban
**Community Impact:** Demonstrating a pattern of violation of
community standards, including sustained inappropriate behaviour,
harassment of an individual, or aggression toward or disparagement of
classes of individuals. This tier also covers confirmed research
misconduct, serious deliberate breaches of data protection, and
malicious abuse of the application or its data (e.g. bulk
re-identification attempts, scraping in violation of upstream terms).
**Consequence:** A permanent ban from any sort of public interaction
within the community.

## 9. Attribution

This Code of Conduct is adapted from the
[Contributor Covenant][homepage], version 2.1, available at
[https://www.contributor-covenant.org/version/2/1/code_of_conduct.html][v2.1].

Community Impact Guidelines were inspired by
[Mozilla's code of conduct enforcement ladder][mozilla-coc].

Project-specific provisions (Section 4) and the security disclosure
section (Section 5) were added to reflect the JuDDGES app's role as an
end-user application working with judicial data, and its commitments
to GDPR compliance, accessibility, FAIR data, and Open Science.

For answers to common questions about this code of conduct, see the
FAQ at [https://www.contributor-covenant.org/faq][faq]. Translations
are available at
[https://www.contributor-covenant.org/translations][translations].

[homepage]: https://www.contributor-covenant.org
[v2.1]: https://www.contributor-covenant.org/version/2/1/code_of_conduct.html
[mozilla-coc]: https://github.com/mozilla/diversity
[faq]: https://www.contributor-covenant.org/faq
[translations]: https://www.contributor-covenant.org/translations
