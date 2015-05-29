import _ = require('lodash');
import {Observable} from 'rx';
import {OmnisharpClient, DriverState, OmnisharpClientOptions} from "omnisharp-client";
import ViewModel = require("./view-model");

class Client extends OmnisharpClient {
    public model: ViewModel;
    public logs: Observable<OmniSharp.OutputMessage>;

    constructor(public path: string, options: OmnisharpClientOptions) {
        super(options);
        this.configureClient();
        this.model = new ViewModel(this);
    }

    public toggle() {
        if (this.currentState === DriverState.Disconnected) {
            var path = atom && atom.project && atom.project.getPaths()[0];
            this.connect({
                projectPath: path
            });
        } else {
            this.disconnect();
        }
    }

    public connect(options?) {
        super.connect(options);

        this.log("Starting OmniSharp server (pid:" + this.id + ")");
        this.log("OmniSharp Location: " + this.serverPath);
        this.log("Change the location that OmniSharp is loaded from by setting the OMNISHARP environment variable");
        this.log("OmniSharp Path: " + this.projectPath);
    }

    public disconnect() {
        super.disconnect();
        this.log("Omnisharp server stopped.");
    }

    public getEditorContext(editor: Atom.TextEditor): OmniSharp.Models.Request {
        editor = editor || atom.workspace.getActiveTextEditor();
        if (!editor) {
            return;
        }
        var marker = editor.getCursorBufferPosition();
        var buffer = editor.getBuffer().getLines().join('\n');
        return {
            Column: marker.column + 1,
            FileName: editor.getURI(),
            Line: marker.row + 1,
            Buffer: buffer
        };
    }

    public makeRequest(editor?: Atom.TextEditor) {
        editor = editor || atom.workspace.getActiveTextEditor();
        // TODO: update and add to typings.
        if (_.has(editor, 'alive') && !editor.alive) {
            return <OmniSharp.Models.Request>{ abort: true };
        }

        if (editor) {
            var marker = editor.getCursorBufferPosition();
            return <OmniSharp.Models.Request>{
                Column: marker.column + 1,
                FileName: editor.getURI(),
                Line: marker.row + 1
            };
        }

        return {};
    }

    public makeDataRequest<T>(data: T, editor?: Atom.TextEditor) {
        return <T>_.extend(data, this.makeRequest(editor));
    }

    private configureClient() {
        this.logs = this.events.map(event => ({
            message: event.Body && event.Body.Message || event.Event || '',
            logLevel: event.Body && event.Body.LogLevel || (event.Type === "error" && 'ERROR') || 'INFORMATION'
        }));

        // Manage our build log for display
        this.logs.subscribe(event => {
            this.model.output.push(event);
            if (this.model.output.length > 1000)
                this.model.output.shift();
        });

        this.errors.subscribe(exception => {
            console.error(exception);
        });

        this.responses.subscribe(data => {
            if (atom.config.get('omnisharp-atom.developerMode')) {
                console.log("omni:" + data.command, data.request, data.response);
            }
        });
    }

    public request<TRequest, TResponse>(action: string, request?: TRequest): Rx.Observable<TResponse> {
        // Custom property that we set inside make request if the editor is no longer active.
        if (request['abort']) {
            return Observable.empty<TResponse>();
        }
        return OmnisharpClient.prototype.request.call(this, action, request);
    }
}

export = Client;

// Hack to workaround issue with ts.transpile not working correctly
(function(Client: any) {
    Client.connect = Client.prototype.connect;
    Client.disconnect = Client.prototype.disconnect;
})(OmnisharpClient);
