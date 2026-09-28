/**
 * THE FOUNDER PACK AS EACH OLD VERSION SHIPPED IT, read straight off the commit that raised the version rather
 * than rebuilt by hand over `founder.ts`'s own diff. `founder-estate.test.ts` used to derive an older version by
 * mutating the current document's JSON, which held only while founder's own file was the one thing moving; since
 * `projectTemplate` (`modules/portfolio.ts`) and `DUE_THIS_WEEK` (`modules/money.ts`) both moved under Founder's
 * pages more than once without founder.ts's version changing, a mutation over today's document could no longer
 * reach an old one (the same drift `usecase-versions.test.ts` calls out for `projectTemplate`). So each constant
 * here is generated, not hand-written (rules.md #7): check out the commit named below, run
 * `useCaseDocument('founder', dayOf(NOW))` from `packages/seed` there with that commit's own `@braindog/*`
 * packages linked in, and print the whole document. Each one is held to the fingerprint
 * `usecase-versions.test.ts`'s DECLARED table already pins for that version, so a constant copied wrong here is
 * caught by the assertion next to it in `founder-estate.test.ts`, not silently trusted.
 */

import { createHash } from 'node:crypto';

export type ShippedDoc = { version: string; declarations: Record<string, unknown>[]; config?: Record<string, unknown>; [key: string]: unknown };

/** The same shape `usecase-versions.test.ts`'s `fingerprint` and `founder-estate.test.ts`'s `printOf` both hash. */
export const shippedFingerprint = (d: ShippedDoc): string =>
  createHash('sha256').update(JSON.stringify({ declarations: d.declarations, config: d.config ?? null })).digest('hex').slice(0, 16);

/** Founder 1.5.0, as `fc456909` shipped it. Fingerprint b3550baded7ee204. */
export const FOUNDER_SHIPPED_1_5_0: ShippedDoc = JSON.parse(String.raw`
{
 "pack": "usecase-founder",
 "requires": {
  "format": 1,
  "primitives": 1,
  "packs": {}
 },
 "declarations": [
  {
   "register": "organisations",
   "name": "Organisations",
   "one": "organisation",
   "icon": "grid",
   "holds": "the companies and ventures you run, where each is registered and the currency it keeps",
   "title": "name",
   "mobile": [
    "name",
    "kind",
    "currency"
   ],
   "fields": [
    {
     "id": "name",
     "label": "Organisation",
     "type": "text",
     "required": true,
     "search": true
    },
    {
     "id": "kind",
     "label": "Kind",
     "type": "enum",
     "values": [
      "company",
      "sole_trader",
      "nonprofit",
      "venture",
      "other"
     ],
     "labels": {
      "company": "Company",
      "sole_trader": "Sole trader",
      "nonprofit": "Nonprofit",
      "venture": "Venture",
      "other": "Other"
     },
     "index": true
    },
    {
     "id": "country",
     "label": "Registered in",
     "type": "text"
    },
    {
     "id": "currency",
     "label": "Currency",
     "type": "text"
    },
    {
     "id": "accounts",
     "label": "Accounts",
     "type": "list",
     "of": "ref",
     "to": "accounts"
    },
    {
     "id": "projects",
     "label": "Projects",
     "type": "list",
     "of": "ref",
     "to": "things"
    },
    {
     "id": "note",
     "label": "Notes",
     "type": "document"
    },
    {
     "id": "tags",
     "type": "list",
     "of": "text"
    }
   ]
  },
  {
   "register": "datapoints",
   "name": "Datapoints",
   "one": "datapoint",
   "icon": "observe",
   "holds": "one number from one project at one moment, reported by the project or polled by the record",
   "title": "name",
   "mobile": [
    "name",
    "value",
    "at"
   ],
   "fields": [
    {
     "id": "name",
     "label": "Measure",
     "type": "text",
     "required": true,
     "index": true,
     "search": true
    },
    {
     "id": "value",
     "label": "Value",
     "type": "decimal",
     "required": true
    },
    {
     "id": "unit",
     "label": "Unit",
     "type": "text"
    },
    {
     "id": "thing",
     "label": "Project",
     "type": "ref",
     "to": "things",
     "index": true
    },
    {
     "id": "organisation",
     "label": "Organisation",
     "type": "ref",
     "to": "organisations",
     "index": true
    },
    {
     "id": "at",
     "label": "When",
     "type": "instant",
     "index": true
    },
    {
     "id": "source",
     "label": "Source",
     "type": "enum",
     "values": [
      "reported",
      "polled",
      "typed",
      "example"
     ],
     "labels": {
      "reported": "Reported",
      "polled": "Polled",
      "typed": "Typed",
      "example": "Example"
     },
     "index": true
    },
    {
     "id": "tags",
     "type": "list",
     "of": "text"
    }
   ]
  },
  {
   "metric": "datapoints-30d",
   "name": "Numbers reported, 30 days",
   "source": "register.datapoints",
   "where": "at after -30d, source is not example",
   "value": {
    "count": "id"
   },
   "format": "int",
   "target": {
    "gte": 1
   },
   "window": "30d",
   "compare": "none"
  },
  {
   "page": "home-founder",
   "title": "Overview",
   "icon": "home",
   "requires": [
    "register.datapoints",
    "register.organisations",
    "register.accounts",
    "register.obligations",
    "register.services"
   ],
   "blocks": [
    {
     "kind": "stat",
     "heading": "{{config:voice_right_now}}",
     "span": 12,
     "cells": [
      {
       "metric": "cash-now",
       "label": "Cash now"
      },
      {
       "metric": "in-30d",
       "label": "Owed to you, 30 days"
      },
      {
       "metric": "out-30d",
       "label": "Owed by you, 30 days"
      },
      {
       "metric": "datapoints-30d",
       "label": "Reported, 30 days"
      }
     ]
    },
    {
     "kind": "table",
     "heading": "Due this week",
     "span": 12,
     "source": "register.obligations",
     "where": "state is open or part, due before +8d",
     "columns": [
      {
       "field": "what",
       "label": "Description",
       "width": "minmax(14ch,1fr)"
      },
      {
       "field": "party",
       "label": "Who",
       "width": "minmax(10ch,18ch)"
      },
      {
       "field": "amount",
       "label": "Amount",
       "width": "15ch",
       "align": "end",
       "sign": {
        "field": "direction",
        "minus": "owed_by_me"
       }
      },
      {
       "field": "due",
       "label": "Due",
       "width": "13ch",
       "align": "end"
      }
     ],
     "order": [
      {
       "field": "due",
       "dir": "asc"
      }
     ],
     "limit": 6,
     "empty": "Nothing is due this week."
    },
    {
     "kind": "table",
     "heading": "Lapsing",
     "span": 12,
     "source": "register.services",
     "where": "state is lapsing",
     "columns": [
      {
       "field": "name",
       "label": "Name",
       "width": "minmax(16ch,1fr)"
      },
      {
       "field": "renews",
       "label": "Renews",
       "width": "15ch",
       "align": "end"
      },
      {
       "field": "cost",
       "label": "Cost",
       "width": "13ch",
       "align": "end"
      }
     ],
     "order": [
      {
       "field": "renews",
       "dir": "asc"
      }
     ],
     "limit": 6,
     "empty": "Nothing is lapsing."
    },
    {
     "kind": "table",
     "heading": "Latest numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "name",
       "label": "Measure",
       "width": "minmax(16ch,1fr)"
      },
      {
       "field": "value",
       "label": "Value",
       "width": "12ch",
       "align": "end"
      },
      {
       "field": "unit",
       "label": "Unit",
       "width": "8ch"
      },
      {
       "field": "source",
       "label": "Source",
       "width": "11ch"
      },
      {
       "field": "at",
       "label": "When",
       "width": "14ch",
       "align": "end"
      }
     ],
     "order": [
      {
       "field": "at",
       "dir": "desc"
      }
     ],
     "limit": 6,
     "empty": "No project has reported a number yet."
    },
    {
     "kind": "table",
     "heading": "Organisations",
     "span": 12,
     "source": "register.organisations",
     "columns": [
      {
       "field": "name",
       "label": "Organisation",
       "width": "minmax(18ch,1fr)"
      },
      {
       "field": "kind",
       "label": "Kind",
       "width": "12ch"
      },
      {
       "field": "country",
       "label": "Registered in",
       "width": "16ch"
      },
      {
       "field": "currency",
       "label": "Currency",
       "width": "9ch"
      }
     ],
     "limit": 6,
     "empty": "No organisations yet."
    }
   ]
  },
  {
   "page": "dashboard",
   "title": "Dashboard",
   "nav": {
    "section": "Dashboard",
    "order": 10
   },
   "icon": "observe",
   "requires": [
    "register.datapoints",
    "register.organisations",
    "register.accounts",
    "register.obligations"
   ],
   "blocks": [
    {
     "kind": "stat",
     "heading": "Across your organisations",
     "lead": true,
     "span": 12,
     "cells": [
      {
       "metric": "cash-now",
       "label": "Cash now",
       "trend": "30d"
      },
      {
       "metric": "in-30d",
       "label": "Owed to you, 30 days"
      },
      {
       "metric": "out-30d",
       "label": "Owed by you, 30 days"
      }
     ]
    },
    {
     "kind": "bar",
     "heading": "Balance by organisation",
     "span": 12,
     "source": "register.organisations",
     "columns": [
      {
       "field": "name"
      },
      {
       "field": "accounts"
      }
     ],
     "empty": "No organisation lists an account yet. Open one and add the accounts it holds."
    },
    {
     "kind": "stat",
     "heading": "The numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example",
     "back": 30,
     "empty": "When a project reports a number, it shows here. Examples are left out."
    },
    {
     "kind": "lines",
     "heading": "Thirty days against the thirty before",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example",
     "back": 30,
     "empty": "Each measure draws a line once a project reports it."
    },
    {
     "kind": "table",
     "heading": "Latest numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "name",
       "label": "Measure",
       "width": "minmax(16ch,1fr)"
      },
      {
       "field": "value",
       "label": "Value",
       "width": "14ch",
       "align": "end"
      },
      {
       "field": "unit",
       "label": "Unit",
       "width": "8ch"
      },
      {
       "field": "organisation",
       "label": "Organisation",
       "width": "minmax(10ch,18ch)"
      },
      {
       "field": "source",
       "label": "Source",
       "width": "11ch"
      },
      {
       "field": "at",
       "label": "When",
       "width": "12ch",
       "align": "end"
      }
     ],
     "order": [
      {
       "field": "at",
       "dir": "desc"
      }
     ],
     "limit": 10,
     "empty": "No project has reported a number yet."
    },
    {
     "kind": "table",
     "heading": "Organisations",
     "span": 12,
     "source": "register.organisations",
     "columns": [
      {
       "field": "name",
       "label": "Organisation",
       "width": "minmax(20ch,1fr)"
      },
      {
       "field": "kind",
       "label": "Kind",
       "width": "14ch"
      },
      {
       "field": "country",
       "label": "Registered in",
       "width": "18ch"
      },
      {
       "field": "currency",
       "label": "Currency",
       "width": "10ch"
      }
     ],
     "empty": "No organisations yet."
    }
   ]
  },
  {
   "page": "organisation",
   "title": "{{name}}",
   "for": {
    "register": "organisations"
   },
   "nav": {
    "section": "Dashboard",
    "order": 20
   },
   "icon": "grid",
   "requires": [
    "register.datapoints",
    "register.organisations",
    "register.accounts"
   ],
   "blocks": [
    {
     "kind": "bar",
     "heading": "Balance",
     "span": 12,
     "source": "register.organisations",
     "where": "name is {{name}}",
     "columns": [
      {
       "field": "name"
      },
      {
       "field": "accounts"
      }
     ],
     "empty": "{{name}} lists no account yet. Add the accounts it holds and its balance shows here."
    },
    {
     "kind": "stat",
     "heading": "The numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example, organisation is {{name}}",
     "back": 30,
     "empty": "When a number is reported for {{name}}, it shows here. Examples are left out."
    },
    {
     "kind": "lines",
     "heading": "Thirty days against the thirty before",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example, organisation is {{name}}",
     "back": 30,
     "empty": "Each measure draws a line once it is reported for {{name}}."
    },
    {
     "kind": "table",
     "heading": "Latest numbers",
     "span": 12,
     "source": "register.datapoints",
     "where": "organisation is {{name}}",
     "columns": [
      {
       "field": "name",
       "label": "Measure",
       "width": "minmax(16ch,1fr)"
      },
      {
       "field": "value",
       "label": "Value",
       "width": "14ch",
       "align": "end"
      },
      {
       "field": "unit",
       "label": "Unit",
       "width": "8ch"
      },
      {
       "field": "source",
       "label": "Source",
       "width": "11ch"
      },
      {
       "field": "at",
       "label": "When",
       "width": "12ch",
       "align": "end"
      }
     ],
     "order": [
      {
       "field": "at",
       "dir": "desc"
      }
     ],
     "limit": 10,
     "empty": "Nothing has been reported for {{name}} yet."
    },
    {
     "kind": "section",
     "heading": "Send numbers here",
     "icon": "observe",
     "span": 12
    }
   ]
  },
  {
   "page": "project",
   "title": "{{name}}",
   "for": {
    "register": "things",
    "where": "lane is building or earning"
   },
   "nav": {
    "section": "Projects",
    "order": 10
   },
   "icon": "thing",
   "requires": [
    "register.things",
    "register.tasks",
    "register.session",
    "register.obligations",
    "register.services",
    "register.datapoints"
   ],
   "blocks": [
    {
     "kind": "stat",
     "heading": "At a glance",
     "span": 12,
     "cells": [
      {
       "metric": "project-open:{{name}}",
       "label": "Open"
      },
      {
       "metric": "project-owed:{{name}}",
       "label": "Owed to you"
      },
      {
       "metric": "project-cost:{{name}}",
       "label": "Costs a year"
      }
     ]
    },
    {
     "kind": "cards",
     "heading": "Where it stands",
     "span": 5,
     "source": "register.things",
     "where": "name is {{name}}",
     "columns": [
      {
       "field": "next",
       "label": "Next step",
       "as": "title"
      },
      {
       "field": "progress",
       "label": "How far along",
       "as": "ring"
      },
      {
       "field": "health",
       "label": "Health",
       "as": "fact"
      },
      {
       "field": "aim",
       "label": "Aiming for",
       "as": "fact"
      },
      {
       "field": "agent",
       "label": "Agent",
       "as": "who"
      }
     ],
     "limit": 1,
     "empty": "Nobody has said where {{name}} stands yet."
    },
    {
     "kind": "table",
     "heading": "Waiting on you",
     "span": 7,
     "source": "register.tasks",
     "where": "thing is {{name}}, state is review or blocked",
     "columns": [
      {
       "field": "what",
       "width": "minmax(16ch,1fr)"
      },
      {
       "field": "state",
       "label": "Status",
       "width": "11ch"
      },
      {
       "field": "changed",
       "label": "Changed by",
       "width": "15ch"
      }
     ],
     "order": [
      {
       "field": "by",
       "dir": "asc"
      }
     ],
     "limit": 6,
     "empty": "Nothing on {{name}} is waiting on you."
    },
    {
     "kind": "todo",
     "heading": "What is open",
     "span": 5,
     "columns": [
      {
       "field": "what"
      },
      {
       "field": "by"
      }
     ],
     "source": "register.tasks",
     "where": "thing is {{name}}, state is open or doing",
     "order": [
      {
       "field": "by",
       "dir": "asc"
      }
     ],
     "limit": 8,
     "empty": "Nothing open on {{name}}."
    },
    {
     "kind": "cards",
     "heading": "Agents",
     "span": 7,
     "columns": [
      {
       "field": "doing",
       "as": "title"
      },
      {
       "field": "agent",
       "as": "who"
      },
      {
       "field": "last_seen",
       "as": "when"
      }
     ],
     "source": "register.session",
     "where": "project is {{spoken}}",
     "order": [
      {
       "field": "last_seen",
       "dir": "desc"
      }
     ],
     "limit": 6,
     "empty": "No agent has touched {{name}}."
    },
    {
     "kind": "table",
     "heading": "Money",
     "span": 8,
     "source": "register.obligations",
     "where": "thing is {{name}}",
     "columns": [
      {
       "field": "what",
       "label": "Description",
       "width": "minmax(18ch,1fr)"
      },
      {
       "field": "direction",
       "label": "Which way",
       "width": "13ch"
      },
      {
       "field": "amount",
       "label": "Amount",
       "width": "15ch",
       "align": "end"
      },
      {
       "field": "due",
       "label": "Due",
       "width": "15ch",
       "align": "end"
      }
     ],
     "order": [
      {
       "field": "due",
       "dir": "asc"
      }
     ],
     "limit": 8,
     "empty": "Nothing owed either way on {{name}}."
    },
    {
     "kind": "spec",
     "heading": "Keeping it alive",
     "span": 4,
     "columns": [
      {
       "field": "name"
      },
      {
       "field": "cost"
      }
     ],
     "source": "register.services",
     "where": "thing is {{name}}",
     "order": [
      {
       "field": "renews",
       "dir": "asc"
      }
     ],
     "limit": 6,
     "empty": "{{name}} runs on nothing you pay for."
    },
    {
     "kind": "note",
     "document": true,
     "heading": "Notes",
     "span": 12,
     "body": "{{note}}",
     "empty": "Nothing is written about {{name}} yet. Its note is on the project."
    },
    {
     "kind": "code",
     "heading": "Work on this from an agent",
     "span": 12,
     "body": "braindog.list tasks where thing is {{name}} and state is open"
    },
    {
     "kind": "stat",
     "heading": "The numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example, thing is {{name}}",
     "back": 30,
     "empty": "When a number is reported for {{name}}, it shows here. Examples are left out."
    },
    {
     "kind": "lines",
     "heading": "Thirty days against the thirty before",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example, thing is {{name}}",
     "back": 30,
     "empty": "Each measure draws a line once it is reported for {{name}}."
    },
    {
     "kind": "section",
     "heading": "Send numbers here",
     "icon": "observe",
     "span": 12
    }
   ]
  }
 ],
 "seeds": [
  {
   "register": "organisations",
   "fields": {
    "name": "Northwind Labs Ltd",
    "kind": "company",
    "country": "United Kingdom",
    "currency": "GBP"
   }
  },
  {
   "register": "datapoints",
   "fields": {
    "name": "Monthly recurring revenue",
    "value": 4200,
    "unit": "GBP",
    "source": "example",
    "at": "2026-09-02T09:00:00Z"
   }
  }
 ],
 "version": "1.5.0",
 "summary": "The organisations you run, the money across them, and the numbers your projects report.",
 "author": "BrainDog",
 "license": "MIT",
 "config": {
  "voice_home": {
   "type": "text",
   "label": "What Home is called",
   "default": "Overview"
  },
  "voice_lists": {
   "type": "text",
   "label": "What the lists are called together",
   "default": "Records"
  },
  "voice_right_now": {
   "type": "text",
   "label": "The heading over what is happening now",
   "default": "The numbers"
  },
  "voice_needs_you": {
   "type": "text",
   "label": "The heading over what needs you",
   "default": "Needs your call"
  },
  "voice_nothing_needs_you": {
   "type": "text",
   "label": "The line when nothing needs you",
   "default": "Nothing needs your call."
  },
  "voice_since_away": {
   "type": "text",
   "label": "The heading over what changed while you were away",
   "default": "While you were building"
  },
  "shared_version": {
   "type": "text",
   "label": "Last shared as"
  },
  "speaks": {
   "type": "bool",
   "label": "Speaks for this BrainDog"
  }
 }
}
`) as ShippedDoc;

/** Founder 1.4.0, as `72e1b7a3` shipped it. Fingerprint 15c1f37be2561258. */
export const FOUNDER_SHIPPED_1_4_0: ShippedDoc = JSON.parse(String.raw`
{
 "pack": "usecase-founder",
 "requires": {
  "format": 1,
  "primitives": 1,
  "packs": {}
 },
 "declarations": [
  {
   "register": "organisations",
   "name": "Organisations",
   "one": "organisation",
   "icon": "grid",
   "holds": "the companies and ventures you run, where each is registered and the currency it keeps",
   "title": "name",
   "mobile": [
    "name",
    "kind",
    "currency"
   ],
   "fields": [
    {
     "id": "name",
     "label": "Organisation",
     "type": "text",
     "required": true,
     "search": true
    },
    {
     "id": "kind",
     "label": "Kind",
     "type": "enum",
     "values": [
      "company",
      "sole_trader",
      "nonprofit",
      "venture",
      "other"
     ],
     "labels": {
      "company": "Company",
      "sole_trader": "Sole trader",
      "nonprofit": "Nonprofit",
      "venture": "Venture",
      "other": "Other"
     },
     "index": true
    },
    {
     "id": "country",
     "label": "Registered in",
     "type": "text"
    },
    {
     "id": "currency",
     "label": "Currency",
     "type": "text"
    },
    {
     "id": "accounts",
     "label": "Accounts",
     "type": "list",
     "of": "ref",
     "to": "accounts"
    },
    {
     "id": "projects",
     "label": "Projects",
     "type": "list",
     "of": "ref",
     "to": "things"
    },
    {
     "id": "note",
     "label": "Notes",
     "type": "document"
    },
    {
     "id": "tags",
     "type": "list",
     "of": "text"
    }
   ]
  },
  {
   "register": "datapoints",
   "name": "Datapoints",
   "one": "datapoint",
   "icon": "observe",
   "holds": "one number from one project at one moment, reported by the project or polled by the record",
   "title": "name",
   "mobile": [
    "name",
    "value",
    "at"
   ],
   "fields": [
    {
     "id": "name",
     "label": "Measure",
     "type": "text",
     "required": true,
     "index": true,
     "search": true
    },
    {
     "id": "value",
     "label": "Value",
     "type": "decimal",
     "required": true
    },
    {
     "id": "unit",
     "label": "Unit",
     "type": "text"
    },
    {
     "id": "thing",
     "label": "Project",
     "type": "ref",
     "to": "things",
     "index": true
    },
    {
     "id": "organisation",
     "label": "Organisation",
     "type": "ref",
     "to": "organisations",
     "index": true
    },
    {
     "id": "at",
     "label": "When",
     "type": "instant",
     "index": true
    },
    {
     "id": "source",
     "label": "Source",
     "type": "enum",
     "values": [
      "reported",
      "polled",
      "typed",
      "example"
     ],
     "labels": {
      "reported": "Reported",
      "polled": "Polled",
      "typed": "Typed",
      "example": "Example"
     },
     "index": true
    },
    {
     "id": "tags",
     "type": "list",
     "of": "text"
    }
   ]
  },
  {
   "metric": "datapoints-30d",
   "name": "Numbers reported, 30 days",
   "source": "register.datapoints",
   "where": "at after -30d, source is not example",
   "value": {
    "count": "id"
   },
   "format": "int",
   "target": {
    "gte": 1
   },
   "window": "30d",
   "compare": "none"
  },
  {
   "page": "home-founder",
   "title": "Overview",
   "icon": "home",
   "requires": [
    "register.datapoints",
    "register.organisations",
    "register.accounts",
    "register.obligations"
   ],
   "blocks": [
    {
     "kind": "stat",
     "heading": "{{config:voice_right_now}}",
     "span": 12,
     "cells": [
      {
       "metric": "cash-now",
       "label": "Cash now"
      },
      {
       "metric": "in-30d",
       "label": "Owed to you, 30 days"
      },
      {
       "metric": "out-30d",
       "label": "Owed by you, 30 days"
      },
      {
       "metric": "datapoints-30d",
       "label": "Reported, 30 days"
      }
     ]
    },
    {
     "kind": "table",
     "heading": "Latest numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "name",
       "label": "Measure",
       "width": "minmax(16ch,1fr)"
      },
      {
       "field": "value",
       "label": "Value",
       "width": "12ch",
       "align": "end"
      },
      {
       "field": "unit",
       "label": "Unit",
       "width": "8ch"
      },
      {
       "field": "source",
       "label": "Source",
       "width": "11ch"
      },
      {
       "field": "at",
       "label": "When",
       "width": "14ch",
       "align": "end"
      }
     ],
     "order": [
      {
       "field": "at",
       "dir": "desc"
      }
     ],
     "limit": 6,
     "empty": "No project has reported a number yet."
    },
    {
     "kind": "table",
     "heading": "Organisations",
     "span": 12,
     "source": "register.organisations",
     "columns": [
      {
       "field": "name",
       "label": "Organisation",
       "width": "minmax(18ch,1fr)"
      },
      {
       "field": "kind",
       "label": "Kind",
       "width": "12ch"
      },
      {
       "field": "country",
       "label": "Registered in",
       "width": "16ch"
      },
      {
       "field": "currency",
       "label": "Currency",
       "width": "9ch"
      }
     ],
     "limit": 6,
     "empty": "No organisations yet."
    }
   ]
  },
  {
   "page": "dashboard",
   "title": "Dashboard",
   "nav": {
    "section": "Dashboard",
    "order": 10
   },
   "icon": "observe",
   "requires": [
    "register.datapoints",
    "register.organisations",
    "register.accounts",
    "register.obligations"
   ],
   "blocks": [
    {
     "kind": "stat",
     "heading": "Across your organisations",
     "lead": true,
     "span": 12,
     "cells": [
      {
       "metric": "cash-now",
       "label": "Cash now",
       "trend": "30d"
      },
      {
       "metric": "in-30d",
       "label": "Owed to you, 30 days"
      },
      {
       "metric": "out-30d",
       "label": "Owed by you, 30 days"
      }
     ]
    },
    {
     "kind": "bar",
     "heading": "Balance by organisation",
     "span": 12,
     "source": "register.organisations",
     "columns": [
      {
       "field": "name"
      },
      {
       "field": "accounts"
      }
     ],
     "empty": "No organisation lists an account yet. Open one and add the accounts it holds."
    },
    {
     "kind": "stat",
     "heading": "The numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example",
     "back": 30,
     "empty": "When a project reports a number, it shows here. Examples are left out."
    },
    {
     "kind": "lines",
     "heading": "Thirty days against the thirty before",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example",
     "back": 30,
     "empty": "Each measure draws a line once a project reports it."
    },
    {
     "kind": "table",
     "heading": "Latest numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "name",
       "label": "Measure",
       "width": "minmax(16ch,1fr)"
      },
      {
       "field": "value",
       "label": "Value",
       "width": "14ch",
       "align": "end"
      },
      {
       "field": "unit",
       "label": "Unit",
       "width": "8ch"
      },
      {
       "field": "organisation",
       "label": "Organisation",
       "width": "minmax(10ch,18ch)"
      },
      {
       "field": "source",
       "label": "Source",
       "width": "11ch"
      },
      {
       "field": "at",
       "label": "When",
       "width": "12ch",
       "align": "end"
      }
     ],
     "order": [
      {
       "field": "at",
       "dir": "desc"
      }
     ],
     "limit": 10,
     "empty": "No project has reported a number yet."
    },
    {
     "kind": "table",
     "heading": "Organisations",
     "span": 12,
     "source": "register.organisations",
     "columns": [
      {
       "field": "name",
       "label": "Organisation",
       "width": "minmax(20ch,1fr)"
      },
      {
       "field": "kind",
       "label": "Kind",
       "width": "14ch"
      },
      {
       "field": "country",
       "label": "Registered in",
       "width": "18ch"
      },
      {
       "field": "currency",
       "label": "Currency",
       "width": "10ch"
      }
     ],
     "empty": "No organisations yet."
    }
   ]
  },
  {
   "page": "organisation",
   "title": "{{name}}",
   "for": {
    "register": "organisations"
   },
   "nav": {
    "section": "Dashboard",
    "order": 20
   },
   "icon": "grid",
   "requires": [
    "register.datapoints",
    "register.organisations",
    "register.accounts"
   ],
   "blocks": [
    {
     "kind": "bar",
     "heading": "Balance",
     "span": 12,
     "source": "register.organisations",
     "where": "name is {{name}}",
     "columns": [
      {
       "field": "name"
      },
      {
       "field": "accounts"
      }
     ],
     "empty": "{{name}} lists no account yet. Add the accounts it holds and its balance shows here."
    },
    {
     "kind": "stat",
     "heading": "The numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example, organisation is {{name}}",
     "back": 30,
     "empty": "When a number is reported for {{name}}, it shows here. Examples are left out."
    },
    {
     "kind": "lines",
     "heading": "Thirty days against the thirty before",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example, organisation is {{name}}",
     "back": 30,
     "empty": "Each measure draws a line once it is reported for {{name}}."
    },
    {
     "kind": "table",
     "heading": "Latest numbers",
     "span": 12,
     "source": "register.datapoints",
     "where": "organisation is {{name}}",
     "columns": [
      {
       "field": "name",
       "label": "Measure",
       "width": "minmax(16ch,1fr)"
      },
      {
       "field": "value",
       "label": "Value",
       "width": "14ch",
       "align": "end"
      },
      {
       "field": "unit",
       "label": "Unit",
       "width": "8ch"
      },
      {
       "field": "source",
       "label": "Source",
       "width": "11ch"
      },
      {
       "field": "at",
       "label": "When",
       "width": "12ch",
       "align": "end"
      }
     ],
     "order": [
      {
       "field": "at",
       "dir": "desc"
      }
     ],
     "limit": 10,
     "empty": "Nothing has been reported for {{name}} yet."
    },
    {
     "kind": "section",
     "heading": "Send numbers here",
     "icon": "observe",
     "span": 12
    }
   ]
  },
  {
   "page": "project",
   "title": "{{name}}",
   "for": {
    "register": "things",
    "where": "lane is building or earning"
   },
   "nav": {
    "section": "Projects",
    "order": 10
   },
   "icon": "thing",
   "requires": [
    "register.things",
    "register.tasks",
    "register.session",
    "register.obligations",
    "register.services",
    "register.datapoints"
   ],
   "blocks": [
    {
     "kind": "stat",
     "heading": "At a glance",
     "span": 12,
     "cells": [
      {
       "metric": "project-open:{{name}}",
       "label": "Open"
      },
      {
       "metric": "project-owed:{{name}}",
       "label": "Owed to you"
      },
      {
       "metric": "project-cost:{{name}}",
       "label": "Costs a year"
      }
     ]
    },
    {
     "kind": "cards",
     "heading": "Where it stands",
     "span": 5,
     "source": "register.things",
     "where": "name is {{name}}",
     "columns": [
      {
       "field": "next",
       "label": "Next step",
       "as": "title"
      },
      {
       "field": "progress",
       "label": "How far along",
       "as": "ring"
      },
      {
       "field": "health",
       "label": "Health",
       "as": "fact"
      },
      {
       "field": "aim",
       "label": "Aiming for",
       "as": "fact"
      },
      {
       "field": "agent",
       "label": "Agent",
       "as": "who"
      }
     ],
     "limit": 1,
     "empty": "Nobody has said where {{name}} stands yet."
    },
    {
     "kind": "table",
     "heading": "Waiting on you",
     "span": 7,
     "source": "register.tasks",
     "where": "thing is {{name}}, state is review or blocked",
     "columns": [
      {
       "field": "what",
       "width": "minmax(16ch,1fr)"
      },
      {
       "field": "state",
       "label": "Status",
       "width": "11ch"
      },
      {
       "field": "changed",
       "label": "Changed by",
       "width": "15ch"
      }
     ],
     "order": [
      {
       "field": "by",
       "dir": "asc"
      }
     ],
     "limit": 6,
     "empty": "Nothing on {{name}} is waiting on you."
    },
    {
     "kind": "todo",
     "heading": "What is open",
     "span": 5,
     "columns": [
      {
       "field": "what"
      },
      {
       "field": "by"
      }
     ],
     "source": "register.tasks",
     "where": "thing is {{name}}, state is open or doing",
     "order": [
      {
       "field": "by",
       "dir": "asc"
      }
     ],
     "limit": 8,
     "empty": "Nothing open on {{name}}."
    },
    {
     "kind": "cards",
     "heading": "Agents",
     "span": 7,
     "columns": [
      {
       "field": "doing",
       "as": "title"
      },
      {
       "field": "agent",
       "as": "who"
      },
      {
       "field": "last_seen",
       "as": "when"
      }
     ],
     "source": "register.session",
     "where": "project is {{spoken}}",
     "order": [
      {
       "field": "last_seen",
       "dir": "desc"
      }
     ],
     "limit": 6,
     "empty": "No agent has touched {{name}}."
    },
    {
     "kind": "table",
     "heading": "Money",
     "span": 8,
     "source": "register.obligations",
     "where": "thing is {{name}}",
     "columns": [
      {
       "field": "what",
       "label": "Description",
       "width": "minmax(18ch,1fr)"
      },
      {
       "field": "direction",
       "label": "Which way",
       "width": "13ch"
      },
      {
       "field": "amount",
       "label": "Amount",
       "width": "15ch",
       "align": "end"
      },
      {
       "field": "due",
       "label": "Due",
       "width": "15ch",
       "align": "end"
      }
     ],
     "order": [
      {
       "field": "due",
       "dir": "asc"
      }
     ],
     "limit": 8,
     "empty": "Nothing owed either way on {{name}}."
    },
    {
     "kind": "spec",
     "heading": "Keeping it alive",
     "span": 4,
     "columns": [
      {
       "field": "name"
      },
      {
       "field": "cost"
      }
     ],
     "source": "register.services",
     "where": "thing is {{name}}",
     "order": [
      {
       "field": "renews",
       "dir": "asc"
      }
     ],
     "limit": 6,
     "empty": "{{name}} runs on nothing you pay for."
    },
    {
     "kind": "note",
     "document": true,
     "heading": "Notes",
     "span": 12,
     "body": "{{note}}",
     "empty": "Nothing is written about {{name}} yet. Its note is on the project."
    },
    {
     "kind": "code",
     "heading": "Work on this from an agent",
     "span": 12,
     "body": "braindog.list tasks where thing is {{name}} and state is open"
    },
    {
     "kind": "stat",
     "heading": "The numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example, thing is {{name}}",
     "back": 30,
     "empty": "When a number is reported for {{name}}, it shows here. Examples are left out."
    },
    {
     "kind": "lines",
     "heading": "Thirty days against the thirty before",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example, thing is {{name}}",
     "back": 30,
     "empty": "Each measure draws a line once it is reported for {{name}}."
    },
    {
     "kind": "section",
     "heading": "Send numbers here",
     "icon": "observe",
     "span": 12
    }
   ]
  }
 ],
 "seeds": [
  {
   "register": "organisations",
   "fields": {
    "name": "Northwind Labs Ltd",
    "kind": "company",
    "country": "United Kingdom",
    "currency": "GBP"
   }
  },
  {
   "register": "datapoints",
   "fields": {
    "name": "Monthly recurring revenue",
    "value": 4200,
    "unit": "GBP",
    "source": "example",
    "at": "2026-09-02T09:00:00Z"
   }
  }
 ],
 "version": "1.4.0",
 "summary": "The organisations you run, the money across them, and the numbers your projects report.",
 "author": "BrainDog",
 "license": "MIT",
 "config": {
  "voice_home": {
   "type": "text",
   "label": "What Home is called",
   "default": "Overview"
  },
  "voice_lists": {
   "type": "text",
   "label": "What the lists are called together",
   "default": "Records"
  },
  "voice_right_now": {
   "type": "text",
   "label": "The heading over what is happening now",
   "default": "The numbers"
  },
  "voice_needs_you": {
   "type": "text",
   "label": "The heading over what needs you",
   "default": "Needs your call"
  },
  "voice_nothing_needs_you": {
   "type": "text",
   "label": "The line when nothing needs you",
   "default": "Nothing needs your call."
  },
  "voice_since_away": {
   "type": "text",
   "label": "The heading over what changed while you were away",
   "default": "While you were building"
  },
  "shared_version": {
   "type": "text",
   "label": "Last shared as"
  },
  "speaks": {
   "type": "bool",
   "label": "Speaks for this BrainDog"
  }
 }
}
`) as ShippedDoc;

/** Founder 1.3.2, as `df458964` shipped it. Fingerprint 3e4927061f959b6d. */
export const FOUNDER_SHIPPED_1_3_2: ShippedDoc = JSON.parse(String.raw`
{
 "pack": "usecase-founder",
 "requires": {
  "format": 1,
  "primitives": 1,
  "packs": {}
 },
 "declarations": [
  {
   "register": "organisations",
   "name": "Organisations",
   "one": "organisation",
   "icon": "grid",
   "holds": "the companies and ventures you run, where each is registered and the currency it keeps",
   "title": "name",
   "mobile": [
    "name",
    "kind",
    "currency"
   ],
   "fields": [
    {
     "id": "name",
     "label": "Organisation",
     "type": "text",
     "required": true,
     "search": true
    },
    {
     "id": "kind",
     "label": "Kind",
     "type": "enum",
     "values": [
      "company",
      "sole_trader",
      "nonprofit",
      "venture",
      "other"
     ],
     "labels": {
      "company": "Company",
      "sole_trader": "Sole trader",
      "nonprofit": "Nonprofit",
      "venture": "Venture",
      "other": "Other"
     },
     "index": true
    },
    {
     "id": "country",
     "label": "Registered in",
     "type": "text"
    },
    {
     "id": "currency",
     "label": "Currency",
     "type": "text"
    },
    {
     "id": "accounts",
     "label": "Accounts",
     "type": "list",
     "of": "ref",
     "to": "accounts"
    },
    {
     "id": "projects",
     "label": "Projects",
     "type": "list",
     "of": "ref",
     "to": "things"
    },
    {
     "id": "note",
     "label": "Notes",
     "type": "document"
    },
    {
     "id": "tags",
     "type": "list",
     "of": "text"
    }
   ]
  },
  {
   "register": "datapoints",
   "name": "Datapoints",
   "one": "datapoint",
   "icon": "observe",
   "holds": "one number from one project at one moment, reported by the project or polled by the record",
   "title": "name",
   "mobile": [
    "name",
    "value",
    "at"
   ],
   "fields": [
    {
     "id": "name",
     "label": "Measure",
     "type": "text",
     "required": true,
     "index": true,
     "search": true
    },
    {
     "id": "value",
     "label": "Value",
     "type": "decimal",
     "required": true
    },
    {
     "id": "unit",
     "label": "Unit",
     "type": "text"
    },
    {
     "id": "thing",
     "label": "Project",
     "type": "ref",
     "to": "things",
     "index": true
    },
    {
     "id": "organisation",
     "label": "Organisation",
     "type": "ref",
     "to": "organisations",
     "index": true
    },
    {
     "id": "at",
     "label": "When",
     "type": "instant",
     "index": true
    },
    {
     "id": "source",
     "label": "Source",
     "type": "enum",
     "values": [
      "reported",
      "polled",
      "typed",
      "example"
     ],
     "labels": {
      "reported": "Reported",
      "polled": "Polled",
      "typed": "Typed",
      "example": "Example"
     },
     "index": true
    },
    {
     "id": "tags",
     "type": "list",
     "of": "text"
    }
   ]
  },
  {
   "metric": "datapoints-30d",
   "name": "Numbers reported, 30 days",
   "source": "register.datapoints",
   "where": "at after -30d, source is not example",
   "value": {
    "count": "id"
   },
   "format": "int",
   "target": {
    "gte": 1
   },
   "window": "30d",
   "compare": "none"
  },
  {
   "page": "home-founder",
   "title": "Overview",
   "icon": "home",
   "requires": [
    "register.datapoints",
    "register.organisations",
    "register.accounts",
    "register.obligations"
   ],
   "blocks": [
    {
     "kind": "stat",
     "heading": "{{config:voice_right_now}}",
     "span": 12,
     "cells": [
      {
       "metric": "cash-now",
       "label": "Cash now"
      },
      {
       "metric": "in-30d",
       "label": "Owed to you, 30 days"
      },
      {
       "metric": "out-30d",
       "label": "Owed by you, 30 days"
      },
      {
       "metric": "datapoints-30d",
       "label": "Reported, 30 days"
      }
     ]
    },
    {
     "kind": "table",
     "heading": "Latest numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "name",
       "label": "Measure",
       "width": "minmax(16ch,1fr)"
      },
      {
       "field": "value",
       "label": "Value",
       "width": "12ch",
       "align": "end"
      },
      {
       "field": "unit",
       "label": "Unit",
       "width": "8ch"
      },
      {
       "field": "source",
       "label": "Source",
       "width": "11ch"
      },
      {
       "field": "at",
       "label": "When",
       "width": "14ch",
       "align": "end"
      }
     ],
     "order": [
      {
       "field": "at",
       "dir": "desc"
      }
     ],
     "limit": 6,
     "empty": "No project has reported a number yet."
    },
    {
     "kind": "table",
     "heading": "Organisations",
     "span": 12,
     "source": "register.organisations",
     "columns": [
      {
       "field": "name",
       "label": "Organisation",
       "width": "minmax(18ch,1fr)"
      },
      {
       "field": "kind",
       "label": "Kind",
       "width": "12ch"
      },
      {
       "field": "country",
       "label": "Registered in",
       "width": "16ch"
      },
      {
       "field": "currency",
       "label": "Currency",
       "width": "9ch"
      }
     ],
     "limit": 6,
     "empty": "No organisations yet."
    }
   ]
  },
  {
   "page": "dashboard",
   "title": "Dashboard",
   "nav": {
    "section": "Dashboard",
    "order": 10
   },
   "icon": "observe",
   "requires": [
    "register.datapoints",
    "register.organisations",
    "register.accounts",
    "register.obligations"
   ],
   "blocks": [
    {
     "kind": "stat",
     "heading": "Across your organisations",
     "lead": true,
     "span": 12,
     "cells": [
      {
       "metric": "cash-now",
       "label": "Cash now",
       "trend": "30d"
      },
      {
       "metric": "in-30d",
       "label": "Owed to you, 30 days"
      },
      {
       "metric": "out-30d",
       "label": "Owed by you, 30 days"
      }
     ]
    },
    {
     "kind": "bar",
     "heading": "Balance by organisation",
     "span": 12,
     "source": "register.organisations",
     "columns": [
      {
       "field": "name"
      },
      {
       "field": "accounts"
      }
     ],
     "empty": "No organisation lists an account yet. Open one and add the accounts it holds."
    },
    {
     "kind": "stat",
     "heading": "The numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example",
     "back": 30,
     "empty": "When a project reports a number, it shows here. Examples are left out."
    },
    {
     "kind": "lines",
     "heading": "Thirty days against the thirty before",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example",
     "back": 30,
     "empty": "Each measure draws a line once a project reports it."
    },
    {
     "kind": "table",
     "heading": "Latest numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "name",
       "label": "Measure",
       "width": "minmax(16ch,1fr)"
      },
      {
       "field": "value",
       "label": "Value",
       "width": "14ch",
       "align": "end"
      },
      {
       "field": "unit",
       "label": "Unit",
       "width": "8ch"
      },
      {
       "field": "organisation",
       "label": "Organisation",
       "width": "minmax(10ch,18ch)"
      },
      {
       "field": "source",
       "label": "Source",
       "width": "11ch"
      },
      {
       "field": "at",
       "label": "When",
       "width": "12ch",
       "align": "end"
      }
     ],
     "order": [
      {
       "field": "at",
       "dir": "desc"
      }
     ],
     "limit": 10,
     "empty": "No project has reported a number yet."
    },
    {
     "kind": "table",
     "heading": "Organisations",
     "span": 12,
     "source": "register.organisations",
     "columns": [
      {
       "field": "name",
       "label": "Organisation",
       "width": "minmax(20ch,1fr)"
      },
      {
       "field": "kind",
       "label": "Kind",
       "width": "14ch"
      },
      {
       "field": "country",
       "label": "Registered in",
       "width": "18ch"
      },
      {
       "field": "currency",
       "label": "Currency",
       "width": "10ch"
      }
     ],
     "empty": "No organisations yet."
    }
   ]
  },
  {
   "page": "organisation",
   "title": "{{name}}",
   "for": {
    "register": "organisations"
   },
   "nav": {
    "section": "Dashboard",
    "order": 20
   },
   "icon": "grid",
   "requires": [
    "register.datapoints",
    "register.organisations",
    "register.accounts"
   ],
   "blocks": [
    {
     "kind": "bar",
     "heading": "Balance",
     "span": 12,
     "source": "register.organisations",
     "where": "name is {{name}}",
     "columns": [
      {
       "field": "name"
      },
      {
       "field": "accounts"
      }
     ],
     "empty": "{{name}} lists no account yet. Add the accounts it holds and its balance shows here."
    },
    {
     "kind": "stat",
     "heading": "The numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example, organisation is {{name}}",
     "back": 30,
     "empty": "When a number is reported for {{name}}, it shows here. Examples are left out."
    },
    {
     "kind": "lines",
     "heading": "Thirty days against the thirty before",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example, organisation is {{name}}",
     "back": 30,
     "empty": "Each measure draws a line once it is reported for {{name}}."
    },
    {
     "kind": "table",
     "heading": "Latest numbers",
     "span": 12,
     "source": "register.datapoints",
     "where": "organisation is {{name}}",
     "columns": [
      {
       "field": "name",
       "label": "Measure",
       "width": "minmax(16ch,1fr)"
      },
      {
       "field": "value",
       "label": "Value",
       "width": "14ch",
       "align": "end"
      },
      {
       "field": "unit",
       "label": "Unit",
       "width": "8ch"
      },
      {
       "field": "source",
       "label": "Source",
       "width": "11ch"
      },
      {
       "field": "at",
       "label": "When",
       "width": "12ch",
       "align": "end"
      }
     ],
     "order": [
      {
       "field": "at",
       "dir": "desc"
      }
     ],
     "limit": 10,
     "empty": "Nothing has been reported for {{name}} yet."
    },
    {
     "kind": "section",
     "heading": "Send numbers here",
     "icon": "observe",
     "span": 12
    }
   ]
  },
  {
   "page": "project",
   "title": "{{name}}",
   "for": {
    "register": "things",
    "where": "lane is building or earning"
   },
   "nav": {
    "section": "Projects",
    "order": 10
   },
   "icon": "thing",
   "requires": [
    "register.things",
    "register.tasks",
    "register.session",
    "register.obligations",
    "register.datapoints"
   ],
   "blocks": [
    {
     "kind": "stat",
     "heading": "At a glance",
     "span": 12,
     "cells": [
      {
       "metric": "project-open:{{name}}",
       "label": "Open"
      },
      {
       "metric": "project-owed:{{name}}",
       "label": "Owed to you"
      },
      {
       "metric": "project-due-soon:{{name}}",
       "label": "Due soon"
      },
      {
       "metric": "project-in-review:{{name}}",
       "label": "In review"
      }
     ]
    },
    {
     "kind": "cards",
     "heading": "Where it stands",
     "span": 5,
     "source": "register.things",
     "where": "name is {{name}}",
     "columns": [
      {
       "field": "next",
       "label": "Next step",
       "as": "title"
      },
      {
       "field": "progress",
       "label": "How far along",
       "as": "ring"
      },
      {
       "field": "health",
       "label": "Health",
       "as": "fact"
      },
      {
       "field": "aim",
       "label": "Aiming for",
       "as": "fact"
      },
      {
       "field": "agent",
       "label": "Agent",
       "as": "who"
      }
     ],
     "limit": 1,
     "empty": "Nobody has said where {{name}} stands yet."
    },
    {
     "kind": "table",
     "heading": "Waiting on you",
     "span": 7,
     "source": "register.tasks",
     "where": "thing is {{name}}, state is review or blocked",
     "columns": [
      {
       "field": "what",
       "width": "minmax(16ch,1fr)"
      },
      {
       "field": "state",
       "label": "Status",
       "width": "11ch"
      },
      {
       "field": "changed",
       "label": "Changed by",
       "width": "15ch"
      }
     ],
     "order": [
      {
       "field": "by",
       "dir": "asc"
      }
     ],
     "limit": 6,
     "empty": "Nothing on {{name}} is waiting on you."
    },
    {
     "kind": "todo",
     "heading": "What is open",
     "span": 5,
     "columns": [
      {
       "field": "what"
      },
      {
       "field": "by"
      }
     ],
     "source": "register.tasks",
     "where": "thing is {{name}}, state is open or doing",
     "order": [
      {
       "field": "by",
       "dir": "asc"
      }
     ],
     "limit": 8,
     "empty": "Nothing open on {{name}}."
    },
    {
     "kind": "cards",
     "heading": "Agents",
     "span": 7,
     "columns": [
      {
       "field": "doing",
       "as": "title"
      },
      {
       "field": "agent",
       "as": "who"
      },
      {
       "field": "last_seen",
       "as": "when"
      }
     ],
     "source": "register.session",
     "where": "project is {{spoken}}",
     "order": [
      {
       "field": "last_seen",
       "dir": "desc"
      }
     ],
     "limit": 6,
     "empty": "No agent has touched {{name}}."
    },
    {
     "kind": "table",
     "heading": "Money",
     "span": 12,
     "source": "register.obligations",
     "where": "thing is {{name}}",
     "columns": [
      {
       "field": "what",
       "label": "Description",
       "width": "minmax(18ch,1fr)"
      },
      {
       "field": "direction",
       "label": "Which way",
       "width": "13ch"
      },
      {
       "field": "amount",
       "label": "Amount",
       "width": "15ch",
       "align": "end"
      },
      {
       "field": "due",
       "label": "Due",
       "width": "15ch",
       "align": "end"
      }
     ],
     "order": [
      {
       "field": "due",
       "dir": "asc"
      }
     ],
     "limit": 8,
     "empty": "Nothing owed either way on {{name}}."
    },
    {
     "kind": "note",
     "document": true,
     "heading": "Notes",
     "span": 12,
     "body": "{{note}}",
     "empty": "Nothing is written about {{name}} yet. Its note is on the project."
    },
    {
     "kind": "code",
     "heading": "Work on this from an agent",
     "span": 12,
     "body": "braindog.list tasks where thing is {{name}} and state is open"
    },
    {
     "kind": "stat",
     "heading": "The numbers",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example, thing is {{name}}",
     "back": 30,
     "empty": "When a number is reported for {{name}}, it shows here. Examples are left out."
    },
    {
     "kind": "lines",
     "heading": "Thirty days against the thirty before",
     "span": 12,
     "source": "register.datapoints",
     "columns": [
      {
       "field": "at"
      },
      {
       "field": "value"
      },
      {
       "field": "name"
      },
      {
       "field": "unit"
      }
     ],
     "where": "source is not example, thing is {{name}}",
     "back": 30,
     "empty": "Each measure draws a line once it is reported for {{name}}."
    },
    {
     "kind": "section",
     "heading": "Send numbers here",
     "icon": "observe",
     "span": 12
    }
   ]
  }
 ],
 "seeds": [
  {
   "register": "organisations",
   "fields": {
    "name": "Northwind Labs Ltd",
    "kind": "company",
    "country": "United Kingdom",
    "currency": "GBP"
   }
  },
  {
   "register": "datapoints",
   "fields": {
    "name": "Monthly recurring revenue",
    "value": 4200,
    "unit": "GBP",
    "source": "example",
    "at": "2026-09-02T09:00:00Z"
   }
  }
 ],
 "version": "1.3.2",
 "summary": "The organisations you run, the money across them, and the numbers your projects report.",
 "author": "BrainDog",
 "license": "MIT",
 "config": {
  "voice_home": {
   "type": "text",
   "label": "What Home is called",
   "default": "Overview"
  },
  "voice_lists": {
   "type": "text",
   "label": "What the lists are called together",
   "default": "Records"
  },
  "voice_right_now": {
   "type": "text",
   "label": "The heading over what is happening now",
   "default": "The numbers"
  },
  "voice_needs_you": {
   "type": "text",
   "label": "The heading over what needs you",
   "default": "Needs your call"
  },
  "voice_nothing_needs_you": {
   "type": "text",
   "label": "The line when nothing needs you",
   "default": "Nothing needs your call."
  },
  "voice_since_away": {
   "type": "text",
   "label": "The heading over what changed while you were away",
   "default": "While you were building"
  },
  "shared_version": {
   "type": "text",
   "label": "Last shared as"
  },
  "speaks": {
   "type": "bool",
   "label": "Speaks for this BrainDog"
  }
 }
}
`) as ShippedDoc;

