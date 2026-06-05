# Review Page Schema

Use this schema for both `figure` and `project` detail pages so all deep links share one structure.

## Core fields

- `slug`: URL segment (`figure-1`, `project-2`)
- `type`: `figure` or `project`
- `title`: display name
- `kicker`: short uppercase category label
- `summary`: one-line description under the title
- `image`: primary visual path
- `swatches`: array of 3 hex colors
- `item_code`: internal reference code
- `maker`: brand, studio, or creator
- `scale_or_scope`: physical scale or project scope
- `status`: draft, published, updated date

## Review content

- `overview`: what the object/project is and why it matters
- `engineering_score`: numeric score string
- `finish_score`: numeric score string
- `presence_score`: numeric score string
- `value_score`: numeric score string
- `pros`: array of 3 concise strengths
- `cons`: array of 3 concise weaknesses
- `verdict`: personal conclusion paragraph
- `next_actions`: what to add or verify next

## Navigation fields

- `previous_slug`: previous detail page slug
- `next_slug`: next detail page slug
- `back_href`: usually `../index.html`

## Authoring rules

- Keep section labels uppercase and short.
- Keep body text factual and compact.
- Use swatches only as accents, not full backgrounds.
- Put unknown facts as `To Be Added` rather than guessing.
