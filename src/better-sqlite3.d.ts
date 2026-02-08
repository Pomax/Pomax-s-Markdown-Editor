declare module 'better-sqlite3' {
    interface Statement {
        run(...params: any[]): { changes: number; lastInsertRowid: number };
        get(...params: any[]): any;
        all(...params: any[]): any[];
    }

    interface Database {
        prepare(sql: string): Statement;
        exec(sql: string): this;
        pragma(sql: string, options?: object): any;
        close(): void;
    }

    interface DatabaseConstructor {
        new (filename: string, options?: object): Database;
        (filename: string, options?: object): Database;
    }

    const Database: DatabaseConstructor;
    export default Database;
}
