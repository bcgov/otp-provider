import sequelize from './config';
import Sequelize, { CreationOptional, InferAttributes, InferCreationAttributes, Model, ModelStatic } from 'sequelize';
import { models } from './umzug';

const grantable = new Set([
  'AccessToken',
  'AuthorizationCode',
  'RefreshToken',
  'DeviceCode',
  'BackchannelAuthenticationRequest',
]);

type DynamicModel = ModelStatic<Model>;
type AppModelMap = Map<string, DynamicModel>;

const mappedModels = models.reduce<AppModelMap>((map, name) => {
  map.set(
    name,
    sequelize.define(name, {
      id: { type: Sequelize.STRING, primaryKey: true },
      ...(grantable.has(name) ? { grantId: { type: Sequelize.STRING } } : undefined),
      ...(name === 'DeviceCode' ? { userCode: { type: Sequelize.STRING } } : undefined),
      ...(name === 'Session' ? { uid: { type: Sequelize.STRING } } : undefined),
      data: { type: Sequelize.JSONB },
      expiresAt: { type: Sequelize.DATE },
      consumedAt: { type: Sequelize.DATE },
    }),
  );

  return map;
}, new Map<string, DynamicModel>());

export class ClientConfig extends Model {
  declare id: CreationOptional<string>;
  declare clientId: string;
  declare clientSecret: CreationOptional<string | null>;
  declare grantTypes: CreationOptional<string[]>;
  declare redirectUris: CreationOptional<string[]>;
  declare scope: CreationOptional<string | null>;
  declare responseTypes: CreationOptional<string[]>;
  declare clientUri: CreationOptional<string | null>;
  declare postLogoutRedirectUris: CreationOptional<string[]>;
  declare tokenEndpointAuthMethod: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ClientConfig.init(
  {
    id: { type: Sequelize.STRING, primaryKey: true },
    applicationType: { type: Sequelize.STRING },
    clientId: { type: Sequelize.STRING, allowNull: false, unique: true },
    clientName: { type: Sequelize.STRING },
    clientSecret: { type: Sequelize.STRING },
    clientUri: { type: Sequelize.STRING },
    allowedCorsOrigins: { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: [] },
    contacts: { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: [] },
    defaultAcrValues: { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: [] },
    defaultMaxAge: { type: Sequelize.INTEGER },
    grantTypes: { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: [] },
    initiateLoginUri: { type: Sequelize.STRING },
    jwks: { type: Sequelize.JSONB, defaultValue: {} },
    jwksUri: { type: Sequelize.STRING },
    logoUri: { type: Sequelize.STRING },
    policyUri: { type: Sequelize.STRING },
    requireAuthTime: { type: Sequelize.BOOLEAN, defaultValue: false },
    redirectUris: { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: [] },
    responseTypes: { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: [] },
    sectorIdentifierUri: { type: Sequelize.STRING },
    tokenEndpointAuthMethod: { type: Sequelize.STRING },
    tosUri: { type: Sequelize.STRING },
    subjectType: { type: Sequelize.STRING },
    postLogoutRedirectUris: { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: [] },
    scope: { type: Sequelize.STRING },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
  },
  { sequelize, modelName: 'ClientConfig', tableName: 'ClientConfig', timestamps: true },
);

export class Otp extends Model<InferAttributes<Otp>, InferCreationAttributes<Otp>> {
  declare id: CreationOptional<string>;
  declare otp: string;
  declare email: string;
  declare attempts: CreationOptional<number>;
  declare active: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare clientId: string;
}

Otp.init(
  {
    id: { type: Sequelize.STRING, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
    otp: { type: Sequelize.STRING, allowNull: false },
    email: { type: Sequelize.STRING, allowNull: false },
    attempts: { type: Sequelize.INTEGER, defaultValue: 0 },
    active: { type: Sequelize.BOOLEAN, defaultValue: true },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    clientId: { type: Sequelize.STRING, allowNull: false },
  },
  { sequelize, modelName: 'Otp', tableName: 'Otp', timestamps: true },
);

export class Event extends Model<InferAttributes<Event>, InferCreationAttributes<Event>> {
  declare id: CreationOptional<number>;
  declare eventType: string;
  declare timestamp: CreationOptional<Date>;
  declare email: string;
  declare clientId: string;
}

Event.init(
  {
    id: {
      allowNull: false,
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    eventType: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    timestamp: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW,
    },
    email: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    clientId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'Event',
    tableName: 'Event',
    timestamps: false,
  },
);

mappedModels.set('ClientConfig', ClientConfig as unknown as DynamicModel);

mappedModels.set('Otp', Otp as unknown as DynamicModel);

mappedModels.set('Event', Event as unknown as DynamicModel);

type FirstPartyModelRegistry = {
  ClientConfig: typeof ClientConfig;
  Otp: typeof Otp;
  Event: typeof Event;
};

const getRequiredModel = (name: string): DynamicModel => {
  const model = mappedModels.get(name);
  if (!model) throw new Error(`Model "${name}" is not registered`);
  return model;
};

export const getFirstPartyModel = <K extends keyof FirstPartyModelRegistry>(name: K): FirstPartyModelRegistry[K] =>
  getRequiredModel(name) as unknown as FirstPartyModelRegistry[K];

export const getOtpModel = () => getFirstPartyModel('Otp');
export const getEventModel = () => getFirstPartyModel('Event');
export const getClientConfigModel = () => getFirstPartyModel('ClientConfig');

export default mappedModels;
