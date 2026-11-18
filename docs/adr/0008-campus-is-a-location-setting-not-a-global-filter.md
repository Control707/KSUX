---
status: proposed
supersedes: SPEC §3 global 3-way Campus switcher (Map #1 shell verdict)
---

# Campus is a location setting, not a global filter

Map #1 put a global `Kennesaw | Marietta | All KSU` Campus switcher over the whole shell. v2 scopes Campus only to screens that are about a physical place: **Now, Parking, Transit, Study, Dining and Events**. The switcher appears only there. Feed, Marketplace, Chats, Scrappy, Course Hubs, Clubs, Profile and Moderation are **KSU-wide**, and each item carries a text campus badge. Marketplace and Clubs keep a local campus filter, with Marketplace sorting the home campus first. The Feed stream formerly named "Campus" becomes "All KSU". Stored records remain strictly `Kennesaw` or `Marietta`. Screens that are not location screens but need a Campus own a local control: the Leaderboard has its own `Kennesaw | Marietta` control with `?campus=`, and Safety has its own scoping.

A global filter silently hid social and commerce content from Students who live on one campus and study on the other. It also made people, chats and Listings appear to "belong" to a campus they don't. Location is what actually differs between campuses. Social content is shared by one university.

## Considered Options

- **Keep the global switcher (Map #1):** rejected. It forced every list query and URL to carry campus state, and it hid cross-campus content.
- **Remove Campus entirely, relying on badges and sorting:** rejected. Parking, Transit, Study, Dining and Events are meaningless without a chosen campus.

## Consequences

The 5-slot nav and URL contract are kept. The switcher state is read only by location screens. KSU-wide queries must not take a campus argument from the shell, and any campus filter on them is local and visible.
