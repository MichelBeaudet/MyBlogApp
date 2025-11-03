// public/navigator_props.js

const content = document.getElementById('content');
const paragraph1 = document.getElementById('paragraph1');
const paragraph2 = document.getElementById('paragraph2');

// Get the HTML file name (current page)
const pageName = window.location.pathname.split("/").pop() || "index.html";
console.log("*** Loaded from HTML page:", pageName);

// Get the current script file name
const currentScript = document.currentScript;
const parts = currentScript.src.split("/");
console.log("*** Running script:", parts.pop());

let output1 = "<h2>Navigator String Properties</h2><ul>";
let output2 = "<h2>Navigator All Properties</h2><ul>";

// Button to fetch system params from server
for (const prop in navigator) {
    if (typeof navigator[prop] === "string") {
        output1 += `<li><strong>${prop}</strong>: ${navigator[prop]}</li>`;
    }
}
output1 += "</ul>";
paragraph1.innerHTML = output1;

for (const prop in navigator) {    
    output2 += `<li><strong>${prop}</strong>: ${navigator[prop]}</li>`;
}
output2 += "</ul>";
paragraph2.innerHTML = output2;

