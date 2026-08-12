# Validation Profiles

## APPEND_RECONSTRUCTION

Validate changed note structure and references.

## INSERT_PLAIN_CONTENT

Validate the inserted structure and references.

## EDIT_SELECTED_NOTE

Validate changed syntax and dependencies. Do not fix failures outside the authorized range.

## EDIT_NOTE

Validate affected regions and dependencies. Leave unrelated pre-existing failures unchanged.

## Validation repair boundary

The validator may revise or remove only content created during the current runtime or content authorized by the user's request.

If a required repair lies outside that boundary, stop repairing, keep the failed check visible, and request authorization rather than broadening the edit.
