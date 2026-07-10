import React from "react";
import htm from "./vendor/htm.js";

// One shared htm binding so app.js and every view module render through the same
// React.createElement. htm memoizes parsed templates by call-site, so binding once
// keeps that cache coherent.
export const html = htm.bind(React.createElement);
