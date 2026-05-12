---
title: How are interpreted recursive functions implemented in SMT solvers?
description: Directions from a confused user
date: 2025-04-25
tags: [smt, research]
---

Having largely used and heard about logics with respect to uninterpreted
function symbols, I was surprised to learn that Smtlib (and therefore the main solvers
like Z3 and CVC5) support adding interpretations to function symbols. Even
recursive ones!

It's kinda hard to find resources on this, and Claude was giving me a bunch of
fake/misleading references but the best source I've found is
<https://github.com/Z3Prover/z3/blob/792ffeeda7195325ce19dff98aaa63a42d7fd739/doc/design_recfuns.md>.

I also found Section 2.2 of [Refinement
Reflection](https://dl.acm.org/doi/10.1145/3158141 ) very interesting.

I still don't fully understand this space, but a key part seems to be how do you
guard/limit the unrolling of the definition on symbolic values?
