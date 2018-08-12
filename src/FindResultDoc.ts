'use strict';

import * as vscode from 'vscode';
import CscopeExecutor from './CscopeExecutor';
import { resolve } from 'path';

export default class FindResultDoc {
    private links: vscode.DocumentLink[];
    private docContent : string;
    private docUri : string;
    private briefing : string;
    private symbol : string;
    private functionIndex : number;
    private executor : CscopeExecutor;

    private async updateContent(symbol, functionIndex):Promise<any> {
        const fileList = await this.executor.execCommand(symbol, functionIndex);
        let content = '';
        let lineNum = 1;
        this.links = [];

        return new Promise((resolve, reject)=>{
            fileList.forEach((line) =>{
                //            const fileInfo = line.fileName.slice(workspacePathLen) + ':' + line.lineNum
                            const fileInfo = line.fileName + ':' + line.lineNum;
                            content += fileInfo + ` ${line.otherText}\n`;
                            const linkRange = new vscode.Range(lineNum, 0, lineNum, fileInfo.length);
                            const linkTarget = vscode.Uri.parse(`file:/${line.fileName}#${line.lineNum}`);
                            const docLink = new vscode.DocumentLink(linkRange, linkTarget);
                            this.links.push(docLink);
                            lineNum++;
            });
            this.docContent = this.briefing + content;
            resolve(true);
        })
    }

    constructor (uri: vscode.Uri, executor:CscopeExecutor){
        const [briefText, symbol, functionIndex] = <[string, string, number]>JSON.parse(uri.query);
        this.briefing = `${briefText} "${symbol}":\n`;
        this.docUri = uri.toString();
        this.symbol = symbol;
        this.functionIndex = functionIndex;
        const workspacePathLen = vscode.workspace.rootPath.length;
        const fileList = executor.execCommand(symbol, functionIndex).then((fileList)=>{
        });

    }

    getDocContent():string{
        return this.docContent;
    }

    getUri() :string{
        return this.docUri;
    }

    getDocLinks():vscode.ProviderResult<vscode.DocumentLink[]>{
        return this.links;
    }
}