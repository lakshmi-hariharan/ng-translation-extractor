# ng-translation-extractor

A tool for extracting translatable strings from the angular html files.

Usage:
The tool can be used in angular project to exact the translatable strings into the command 
line output. 

Once done, these strings can be placed in en.json files and can be used along with 
ngx-translate package for easy translation of angular projects where strings are hardcoded
in HTML files.

This utility does not translate strings defined inside the ts files which shows up on UI. 


The tool uses the html (tree structure) of the underlying dom to do a 
depth first analysis of all the leaf nodes and checks if the value starts with a variable
in angular [Squiggly Braces '{{'] and then moves them to the output. Also externalizes strings
with variables.
