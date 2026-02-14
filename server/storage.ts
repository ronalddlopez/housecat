export interface IStorage {}

export class AppStorage implements IStorage {}

export const storage = new AppStorage();
