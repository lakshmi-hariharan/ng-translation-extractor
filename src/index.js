const path = require("path")
const fs = require("fs");
const fsasync = require("fs").promises;
const parser = require("node-html-parser");

htmlcomponentfiles = [];
translateDictionary = {};
let undonechildren = [];

function fromDir(startPath, filter, callback) {
  if (!fs.existsSync(startPath)) {
    console.error("not a valid directory ", startPath);
    return;
  }
  var files = fs.readdirSync(startPath);
  for (var i = 0; i < files.length; i++) {
    var filename = path.join(startPath, files[i]);
    var stat = fs.lstatSync(filename);
    if (stat.isDirectory()) {
      fromDir(filename, filter, callback); //recurse
    } else if (filter.test(filename)) {
      htmlcomponentfiles.push(filename);      
    }
  }
}

async function readHtmlFiles() {
  var args = process.argv.slice(2);
  let folder = args[0];
  let canWrite = args[1];
  console.log(folder, canWrite);
  fromDir(   
    args[0],
    /\.component.html$/,
    function(filename) {
      htmlcomponentfiles.push(filename);
    }
  );
  for (htmlcomponentfile of htmlcomponentfiles) {
    
    console.log("html file being processed = " + htmlcomponentfile);
    const content = await fsasync.readFile(htmlcomponentfile, "utf-8");    
    let root = parser.parse(content, {comment: true});    
    let componentName = path.basename(htmlcomponentfile, "html");
    componentName = componentName.split(".component")[0]; 
    let changed = {"value": false};
    parseHTMLNode(componentName, root, 1, changed); 
    if(changed.value == true){
      if(args[1] == "true") {        
        await fsasync.writeFile(this.htmlcomponentfile, root.toString(), 'utf8');
      }
      else {
        //This is the validation block-- 
        console.log("validation failed for file ", htmlcomponentfile, 
        " File has strings that needs to be translated");
      }       
    }
  }
  console.log(JSON.stringify(this.translateDictionary, null, 2));
}

/**
 * A recursive function which does a breadth-first tree traversal 
 * to check for each textNode. The html-parser-library thinks of
 * comment nodes as text node with a type of 8 and can be ignored.
 * 
 * There are 3 main codelogics
 * 1) Innertext with no variables.
 * 2) Placeholders with no variables
 * 3) Innertext with variables -- this also attempts to give the typescript 
 * code that can be copied.
 * 
 * There are couple of problems with this code
 * 1) <div *ngIf  ---- gets parsed incorrectly.
 * 2) The code cant handle multiple variables to be passed into ngtranslate pipe
 * 3) The code cant handle generating typescript code for variables with pipes. 
 * (possibly can be done with little effort)
 * 4) Some linebreaks are removed.
 * 5) May be can look at adding to en.json as well
 *  
 * 
 * @param {} htmlname 
 * @param {*} root 
 * @param {*} i 
 * @param {*} changed 
 */

function parseHTMLNode(htmlname, root, i, changed) {  
 
  if (root.childNodes != undefined && root.childNodes.length > 0) {
    let children = root.childNodes;
    if (children.length > 0) {
      for (child of children) {
        undonechildren.push(child);        
      }
    }
  } else {
    if(root.rawText !== undefined ) {
      if(root.nodeType === 8) {
       //just skip comment. Comment node have nodetype as 8
      }
      else {
        let trimmedText = root.rawText.replace(/(\r\n|\n|\r)/gm, "");        
        trimmedText = trimmedText.replace(/\t/gm,"");
        trimmedText = trimmedText.trim();
        
        if(!isPartofDiscardList(trimmedText) && trimmedText !== ""){          
          //Changes for externizing the innertext contents. 
          //1) Make sure content doesnt start with string interpolation and check variable names
          if(!(trimmedText.startsWith("{{") || trimmedText.includes("{{"))) {         
            const key = computeKey(htmlname, trimmedText, 3);
            translateDictionary[key] = root.rawText.trim();
            root.rawText = "{{'" + key + "' | translate}}";
            changed.value = true;
          }
          if(((!trimmedText.startsWith("{{") || !trimmedText.endsWith("}}")) && trimmedText.includes("{{") )) {
            //This code doesnt handle pipes inside the variables-- something to handle later
            const key = computeKey(htmlname, trimmedText, 2);
            this.translateDictionary[key] = trimmedText;
            const trv = "trVariable" + (i++);
            const startVariablePoint = trimmedText.indexOf("{{");
            const endVariablePoint = trimmedText.indexOf("}}");
            const variableData = trimmedText.substr(startVariablePoint + 2, endVariablePoint - startVariablePoint - 2 );
            console.log("this." + trv + " = {\"value\" : " + "this." + variableData.trim() + "}");
            this.translateDictionary[key] = trimmedText.replace(variableData, "value");
            root.rawText = "{{'" + key + "' | translate: " + trv + "}}";
            changed.value = true;
          }

        }
      }
    }
    if(root.attributes !== undefined && root.attributes["placeholder"] != undefined) {
      let attrs = root.attributes;
      let placeholderValue = attrs["placeholder"];
      const trimmedPlaceholder = placeholderValue.trim();
      if(!isPartofDiscardList(trimmedPlaceholder) && !trimmedPlaceholder.startsWith("{{") && trimmedPlaceholder.includes("{{") && !!trimmedPlaceholder.startsWith("{{")) {       
        let key = computeKey(htmlname, trimmedPlaceholder);
        this.translateDictionary[key] = placeholderValue;
        root.rawAttrs = root.rawAttrs.replace(placeholderValue, "{{'" + key + "' | translate}}" );
        translateDictionary[key] = placeholderValue;
        changed.value = true;
      }
      /* There are no placeholders currently with variables , can be added in future*/
      /*if((!trimmedPlaceholder.startsWith("{{") || !trimmedPlaceholder.endsWith("}}")) && trimmedPlaceholder.includes("{{") ) {
        //console.log("ext " + root.rawAttrs);
      }*/
    }
   
  }

  if (undonechildren.length > 0) {
    root = undonechildren.shift();    
    parseHTMLNode(htmlname, root, i, changed);

  }
}

/**
 * This function computes the key based on htmlname, 
 * the string to be translated and how many words to considered.
 * The goal is not make sure that the key generated is valid for the given run and
 * the key is not duplicated.
 * @param {} htmlname 
 * @param {*} translatableText 
 * @param {*} howMany 
 */

function computeKey(htmlname, translatableText, howMany) {
  let key = htmlname + "." + translatableText.replace(/ /g, "_");
  key = key.split("_").slice(0, howMany).join("_");
  key = key.toLowerCase();
  key = key.replace(/[^a-zA-Z0-9_.-]/g, "");
  //Logic for handling key name contentions
  if((translateDictionary[key] != undefined && translateDictionary[key] !== translatableText) || key.endsWith("_")) {
    key = key + getRandomInt(100);
  } 
  return key;
}

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

//This list can be expanded
function isPartofDiscardList(value) {
  let discardValues = {
    "&nbsp;":"",
    "&times;": "",
    "(":"",
    ")":""
  }
  if(discardValues[value] === undefined) {
    return false;
  }
  else return true;
}

readHtmlFiles();


