'use strict';

/*
cscope find command:
 0 Find this C symbol:
 1 Find this function definition:
 2 Find functions called by this function:
 3 Find functions calling this function:
 4 Find this text string:
 5 Change this text string:
 6 Find this egrep pattern:
 7 Find this file:
 8 Find files #including this file:
*/

const spawnSync = require('child_process').spawnSync;
const spawn = require('child_process').spawn;
const fs = require('fs');
import SymbolLocation from './SymbolLocation';
import OutputInterface from './OutputInterface';
import { resolve } from 'dns';

function cmdRunner(cmd, args, option):Promise<any> {
    return new Promise((resolve, reject) => {
        const ret = spawn(cmd, args, option);
        let result = {
            stdout:[],
            stderr:[]
        };

        ret.stdout.on('data', (data) => {
            result.stdout += data;
        });

        ret.stderr.on('data', (data) => {
            result.stderr = data;
            console.log(data.toString())
        });

        ret.on('close', (code) => {
            resolve(result);
        });
    });
}

function writeFile(path, contents):Promise<any> {
    return new Promise((resolve, reject) => {
        fs.writeFile(path, contents, (err)=>{
            if (err) {
                resolve("fail");
            }
            else {
                resolve("ok");
            }
        });
    });
}

export default class CscopeExecutor {
    source_paths:string[];
    exec_path:string;
    outInf:OutputInterface;

    constructor(source_paths:string[], exec_path:string, out:OutputInterface)
    {
        this.source_paths = source_paths;
        this.exec_path = exec_path;
        this.outInf = out;
    }

    private databaseReady():boolean {
        try {
            fs.accessSync(this.exec_path + '/cscope/cscope.out', fs.constants.R_OK | fs.constants.W_OK);
            return true;
        }
        catch (err)
        {
            console.log(err.toString());
            return false;
        }
    }

    public checkTool():boolean{
        const cscopeExecConfig = {
            cwd: this.exec_path,
            env: process.env};

        const ret = spawnSync("cscope", ['-V'], cscopeExecConfig);
        let toolAvailable = false;
        if ((ret.stdout) && (ret.stdout.length > 0))
        {
            if (ret.stdout.toString().search("cscope: version.*") === 0)
            {
                toolAvailable = true;
            }
        }
        else if ((ret.stderr) && (ret.stderr.length > 0)){
            if (ret.stderr.toString().search("cscope: version.*") === 0)
            {
                toolAvailable = true;
            }
            else{
                this.outInf.diagLog(ret.stderr.toString());
            }

        }
        return toolAvailable;
    }

    private verifyCscope():boolean {
        if (!this.checkTool())
        {
            this.outInf.errorToUser("cscope is not installed (or not added to PATH)");
            return false;
        }

        if (!this.databaseReady())
        {
            this.outInf.errorToUser("No database found, pls build and try again!");
            return false;
        }

        return true;
    }

    public async buildDataBase():Promise<boolean>{

        if (!this.checkTool())
        {
            this.outInf.errorToUser("cscope is not installed (or not added to PATH)");
            return false;
        }

        let start = true;
        for (let i = 0; i < this.source_paths.length; ++i) {
            let path = this.source_paths[i];
//        await this.source_paths.forEach(async (path) => {
            const execConfig = {
                cwd: this.exec_path,
                env: process.env};

            let ret = await cmdRunner("mkdir", ['-p', 'cscope'], execConfig);
            ret = await cmdRunner("find", [path, '-type', 'f', '-name', '*.c',
                               '-o', '-type', 'f', '-name', '*.h',
                               '-o', '-type', 'f', '-name', '*.cpp',
                               '-o', '-type', 'f', '-name', '*.cc',
                               '-o', '-type', 'f', '-name', '*.mm'], execConfig);
            if (ret.stderr.length > 0) {
                console.log(ret.stderr.toString());
            }
            else {
                if (start) {
                    await writeFile(this.exec_path + '/cscope/cscope.files', ret.stdout.toString());
                }
                else{
                    await writeFile(this.exec_path + '/cscope/cscope.files', ret.stdout.toString());
                }
                start = false;
            }
        }

        const cscopeExecConfig = {
            cwd: this.exec_path + '/cscope',
            env: process.env};
        let retRun = await cmdRunner("cscope", ['-b', '-q', '-k'], cscopeExecConfig);
        return true;
    }

    public async execCommand(targetText:string, level:number):Promise<SymbolLocation[]>{

        let result = null;
        if (this.verifyCscope()) {
            const cscopeExecConfig = {
                cwd: this.exec_path + '/cscope',
                env: process.env};

            let ret = await cmdRunner("cscope", ['-q', '-L' + level + targetText], cscopeExecConfig);
            const fileList = ret.stdout.toString().split('\n');
            let list = [];
            for (let i = 0; i < fileList.length; ++i) {
                const line = fileList[i];
                const contents = line.split(' ');
                if (contents.length > 3)
                {
                    let fileName = contents[0];
    //                console.log(fileName);
                    const lineNum = parseInt(contents[2]);

                    let otherText = contents[1];
                    for (let i = 3; i < contents.length; ++i)
                    {
                        otherText += ` ${contents[i]}`;
                    }

                    list.push(new SymbolLocation(fileName, lineNum, 0, 0, otherText));
                }
            }
            result =  list;
        }

        return new Promise<SymbolLocation[]>((resolve, reject)=>{
            resolve(result);
        });
    }

    public async findReferences(symbol:string):Promise<SymbolLocation[]>{
        return await this.execCommand(symbol, 0);
    }

    public async findDefinition(symbol:string):Promise<SymbolLocation[]>{
        return await this.execCommand(symbol, 1);
    }

    public async findCallee(symbol:string):Promise<SymbolLocation[]>{
        return await this.execCommand(symbol, 2);
    }

    public async findCaller(symbol:string):Promise<SymbolLocation[]>{
        return await this.execCommand(symbol, 3);
    }

    public async findText(symbol:string):Promise<SymbolLocation[]>{
        return await this.execCommand(symbol, 4);
    }

    public async findPattern(symbol:string):Promise<SymbolLocation[]>{
        return await this.execCommand(symbol, 6);
    }

    public async findThisFile(symbol:string):Promise<SymbolLocation[]>{
        return await this.execCommand(symbol, 7);
    }

    public async findIncluder(symbol:string):Promise<SymbolLocation[]>{
        return await this.execCommand(symbol, 8);
    }
}
