import {helpers, Observable, ReplaySubject, Subject, Scheduler} from 'rx';
import manager = require("./client-manager");
import Client = require("./client");
//import {DriverState} from "omnisharp-client";
import _ = require('lodash');

/**
* monitor config
*/
var showDiagnosticsForAllSolutions = (function() {
    let subject = new ReplaySubject<boolean>(1);
    subject.onNext(atom.config.get<boolean>("omnisharp-atom.showDiagnosticsForAllSolutions"));

    atom.config.onDidChange("omnisharp-atom.showDiagnosticsForAllSolutions", function() {
        let enabled = atom.config.get<boolean>("omnisharp-atom.showDiagnosticsForAllSolutions");
        subject.onNext(enabled);
    });

    return <Observable<boolean>>subject;
})();

class Omni {
    // TODO: Remove this later when we do proper static VM
    public static showDiagnosticsForAllSolutions = showDiagnosticsForAllSolutions;

    public static toggle() {
        if (manager.connected) {
            manager.disconnect();
        } else {
            manager.connect();
        }
    }

    public static get isOff() { return manager.isOff; }
    public static get isOn() { return manager.isOn; }

    public static navigateTo(response: { FileName: string; Line: number; Column: number; }) {
        atom.workspace.open(response.FileName, undefined)
            .then((editor) => {
                editor.setCursorBufferPosition([response.Line && response.Line - 1, response.Column && response.Column - 1])
            });
    }

    public static getFrameworks(projects: string[]): string {
        var frameworks = _.map(projects, (project: string) => {
            return project.indexOf('+') === -1 ? '' : project.split('+')[1];
        }).filter((fw: string) => fw.length > 0);
        return frameworks.join(',');
    }

    /**
    * This property can be used to listen to any event that might come across on any clients.
    * This is a mostly functional replacement for `registerConfiguration`, though there has been
    *     one place where `registerConfiguration` could not be replaced.
    */
    public static get listener() {
        return manager.observationClient;
    }

    /**
    * This property can be used to observe to the aggregate or combined responses to any event.
    * A good example of this is, for code check errors, to aggregate all errors across all open solutions.
    */
    public static get combination() {
        return manager.combinationClient;
    }

    /**
    * This method allows us to forget about the entire client model.
    * Call this method with a specific editor, or just with a callback to capture the current editor
    *
    * The callback will then issue the request
    * NOTE: This API only exposes the operation Api and doesn't expose the event api, as we are requesting something to happen
    */
    public static request<T>(editor: Atom.TextEditor, callback: (client: OmniSharp.ExtendApi) => Rx.Observable<T> | Rx.IPromise<T>);
    public static request<T>(callback: (client: OmniSharp.ExtendApi) => Rx.Observable<T> | Rx.IPromise<T>);
    public static request<T>(editor: Atom.TextEditor | ((client: OmniSharp.ExtendApi) => Rx.Observable<T> | Rx.IPromise<T>), callback?: (client: OmniSharp.ExtendApi) => Rx.Observable<T> | Rx.IPromise<T>) {
        if (_.isFunction(editor)) {
            callback = <any>editor;
            editor = null;
        }

        var clientCallback = (client: Client) => {
            var r = callback(client);
            if (helpers.isPromise(r)) {
                return Observable.fromPromise(<Rx.IPromise<T>> r);
            } else {
                return <Rx.Observable<T>>r;
            }
        };

        var result: Observable<T>;

        if (editor) {
            result = manager.getClientForEditor(<Atom.TextEditor> editor).flatMap(clientCallback).share();
        } else {
            result = manager.activeClient.first().flatMap(clientCallback).share();
        }

        // Ensure that the underying promise is connected
        //   (if we don't subscribe to the reuslt of the request, which is not a requirement).
        var sub = result.subscribe(() => sub.dispose());

        return result;
    }

    /**
    * Allows for views to observe the active model as it changes between editors
    */
    public static get activeModel() {
        return manager.activeClient.map(z => z.model);
    }

    public static registerConfiguration(callback: (client: Client) => void) {
        manager.registerConfiguration(callback);
    }

    /**
    * This is used to push updates to a client using the cached client... this is a potentially dangerous operation if the client hasn't been setup!
    */
    public static enqueue<T>(editor: Atom.TextEditor, callback: (client: OmniSharp.ExtendApi) => Rx.Observable<T> | Rx.IPromise<T>) {
        if (!editor['__omniClient__'])
            return Omni.request(editor, callback);

        return callback(editor['__omniClient__']);
    }
}

export = Omni
