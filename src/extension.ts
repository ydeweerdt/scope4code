'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
const spawnSync = require('child_process').spawnSync;
const spawn = require('child_process').spawn;
const fs = require('fs');
import {RefProvider} from './RefProvider';
import {DefinitionProvider} from './DefinitionProvider';
import CscopeExecutor from './CscopeExecutor';
import SearchResultProvider, {openSearch} from './SearchResultProvider';
import OutputInterface from './OutputInterface';

let configurations = null;
const configPath = vscode.workspace.rootPath + '/.vscode/cscope_conf.json';

class VscodeOutput implements OutputInterface {
    diagLog(diagInfo:string) {
        console.log("scope4code: " + diagInfo);
    }

    errorToUser(errorMsg:string) {
        vscode.window.showErrorMessage("scope4code: " + errorMsg);
    }
};

const out = new VscodeOutput;
let status = null;

function updateStatus(text) {
    if (status) {
        status.text = text;

        if (text) {
            status.show();
        } else {
            status.hide();
        }
    }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
//	status.command = 'extension.';
    context.subscriptions.push(status);

    //start initializing environment only after a workspace folder is opened
    if (vscode.workspace.rootPath)
    {
        configurations = JSON.parse(loadConfiguration());
        // Use the console to output diagnostic information (console.log) and errors (console.error)
        // This line of code will only be executed once when your extension is activated

        const executor = new CscopeExecutor(null, vscode.workspace.rootPath + '/.vscode', out);
        const searchResult = new SearchResultProvider(executor);

        const providerRegistrations = vscode.Disposable.from(
            vscode.workspace.registerTextDocumentContentProvider(SearchResultProvider.scheme, searchResult),
            vscode.languages.registerDocumentLinkProvider({ scheme: SearchResultProvider.scheme }, searchResult)
        );

        // The command has been defined in the package.json file
        // Now provide the implementation of the command with  registerCommand
        // The commandId parameter must match the command field in package.json
        const disposableBuild = vscode.commands.registerCommand('extension.build', () => {
            buildDataBase();
        });

        const findSymbolCmd = vscode.commands.registerCommand('extension.findSymbol', () => {
            findSymbol();
        });

        const findDefinitionCmd = vscode.commands.registerCommand('extension.findDefinition', () => {
            findDefinition();
        });

        const findCalleeCmd = vscode.commands.registerCommand('extension.findCallee', () => {
            findCallee();
        });

        const findCallerCmd = vscode.commands.registerCommand('extension.findCaller', () => {
            findCaller();
        });

        const findTextCmd = vscode.commands.registerCommand('extension.findText', () => {
            findText();
        });

    /*    const findIncludeCmd = vscode.commands.registerCommand('extension.findInclude', () => {
            findInclude();
        });*/

        context.subscriptions.push(vscode.languages.registerReferenceProvider(["cpp", "c"], new RefProvider(executor)));
        context.subscriptions.push(vscode.languages.registerDefinitionProvider(['cpp', 'c'], new DefinitionProvider(executor)));
        context.subscriptions.push(searchResult, providerRegistrations, findCalleeCmd);
        context.subscriptions.push(findCallerCmd, findTextCmd);//, findIncludeCmd);
    }
}

const defaultConfig =
'{\n' +
'    "version": "0.0.5",\n' +
'    "open_new_column" : "no",\n' +
'    "engine_configurations": [\n' +
'        {\n' +
'            "cscope" : {\n' +
'                "paths" : [\n' +
'                    "${workspaceRoot}"\n' +
'                ]\n' +
'            }\n' +
'        }\n' +
'    ]\n' +
'}';

function loadConfiguration():string
{
    const vscodePath = vscode.workspace.rootPath + '/.vscode';

    try{
        fs.accessSync(vscodePath, fs.constants.R_OK | fs.constants.W_OK);
    }
    catch{
        out.diagLog(".vscode folder does not exist, creating new one");
        fs.mkdirSync(vscodePath);
    }

    try{
        fs.accessSync(configPath, fs.constants.R_OK);
    }
    catch{
        out.diagLog("cscope_conf.json does not exist, creating new one");
        fs.writeFileSync(configPath, defaultConfig);
    }

    let configText = fs.readFileSync(configPath).toString();
    try {
        JSON.parse(configText);
    }
    catch{
        out.diagLog("cscope_conf.json is invalid, creating new one");
        fs.writeFileSync(configPath, defaultConfig);
        configText = defaultConfig;
    }
    return configText;
}

// Reload and return new configurations if it is valid.
// If any error occured, return the old one.
function reloadConfiguration():any
{
    let ret = configurations;

    try {
        ret = JSON.parse(fs.readFileSync(configPath).toString());
    }
    catch {
        // Creating new one is not a good idea here
        // because user may not have finished his modification.
        vscode.window.showErrorMessage('cscope_conf.json is invalid');
    }
    return ret;
}

async function buildDataBase()
{
    let newConfig = reloadConfiguration();
    const sourcePaths = newConfig.engine_configurations[0].cscope.paths;

    const execConfig = {
        cwd: vscode.workspace.rootPath,
        env: process.env};
    let ret = await spawn("mkdir", ['-p', '.vscode'], execConfig);

    let paths = [];
    sourcePaths.forEach((path) => {
        const fullPath = path.replace("${workspaceRoot}", vscode.workspace.rootPath);
        paths.push(fullPath);
    });

    // start with linux command line since this is easier. Later shall change
    // to node api for file search.5
    // Now we are building the database
    const executor = new CscopeExecutor(paths, vscode.workspace.rootPath + '/.vscode', out);

    if (executor.checkTool()) {
        vscode.window.showInformationMessage('Building cscope database!');
        updateStatus("cscope: Building...");
        await executor.buildDataBase();
        vscode.window.showInformationMessage('Building finished!');
        updateStatus("cscope: Ready");
    }
    else {
        vscode.window.showInformationMessage('cscope command is not detected, please ensure cscope command is accessible.');
    }
}

function findSymbol()
{
    openSearch("All references found for symbol:", 0, configurations.open_new_column === "yes");
}

function findDefinition()
{
    openSearch("Definitions found for symbol:", 1, configurations.open_new_column === "yes");
}

function findCallee()
{
    openSearch("All functions called by:", 2, configurations.open_new_column === "yes");
}

function findCaller()
{
    openSearch("All functions who called:", 3, configurations.open_new_column === "yes");
}

function findText()
{
    openSearch("All places occures of text:", 4, configurations.open_new_column === "yes");
}

function findInclude()
{
    openSearch("All files that includes:", 8, configurations.open_new_column === "yes");
}

// this method is called when your extension is deactivated
export function deactivate() {
}