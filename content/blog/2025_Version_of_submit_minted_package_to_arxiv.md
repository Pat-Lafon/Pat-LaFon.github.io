---
title: Submitting a Paper to Arxiv with Minted (2025)
description: This is a post on My Blog about touchpoints and circling wagons.
date: 2025-04-14
tags: [latex, research]
draft: true
---

# Minted/Arxiv

Latex and submitting to Arxiv can cause psycological damage.

Here is what I did:

Do the steps in https://tex.stackexchange.com/questions/732716/end-of-2024-version-of-how-to-submit-tex-minted-package-to-arxiv

Then
https://tex.stackexchange.com/questions/519573/arxiv-undefined-references-and-citations-unable-to-convert-to-pdf
(though I'm not sure if this is required)

Use https://github.com/google-research/arxiv-latex-cleaner and modify a version
of the following script(replace `Cobb` with the foldername of your paper)

(possible clean up files if doing this repeatedly `rm -r Cobb_arXiv* &&`)

```sh
arxiv_latex_cleaner Cobb \\
&& cp -r Cobb/minted-cache Cobb_arXiv/minted-cache \\
&& cp Cobb/build/main.bbl Cobb_arXiv/ \\
&& zip -r Cobb_arXiv.zip Cobb_arXiv/
```

Note that you need to specify to minted that you want to use a cache and what
directory it will put it in(depends on the version which is annoying. Many posts
online are for Minted v2.0, but Minted v3.0 does things differently)

Something like:

```tex
\usepackage[cachedir=minted-cache]{minted}
```
to build locally and then

```tex
\usepackage[frozencache=true,cachedir=minted-cache]{minted}
```
when submitting to Arxiv.