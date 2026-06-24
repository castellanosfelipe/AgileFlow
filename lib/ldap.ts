import { Client, InvalidCredentialsError, type Entry } from "ldapts";

import { prisma } from "@/lib/prisma";

export type LdapUser = {
  dn: string;
  username: string;
  name: string;
  email: string;
};

export type LdapConnectionConfig = {
  name: string;
  host: string;
  port: number;
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  userFilter: string;
  loginAttribute: string;
  createdAt?: Date;
};

function getStringAttribute(entry: Entry, attribute: string) {
  const value = entry[attribute];
  if (Array.isArray(value)) return String(value[0] ?? "");
  return value ? String(value) : "";
}

function escapeLdapFilterValue(value: string) {
  return value.replace(/[\\()*\0]/g, (character) => {
    switch (character) {
      case "\\":
        return "\\5c";
      case "(":
        return "\\28";
      case ")":
        return "\\29";
      case "*":
        return "\\2a";
      case "\0":
        return "\\00";
      default:
        return character;
    }
  });
}

function parseLdapUrl(value: string) {
  const url = new URL(value);
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === "ldaps:" ? 636 : 389))
  };
}

function buildEnvUserFilter() {
  const baseFilter = process.env.LDAP_USER_FILTER ?? "(objectClass=user)";
  const groupDn = process.env.LDAP_REQUIRED_GROUP_DN?.trim();

  if (!groupDn) return baseFilter;

  return `(&${baseFilter}(memberOf:1.2.840.113556.1.4.1941:=${escapeLdapFilterValue(
    groupDn
  )}))`;
}

function getEnvLdapConfig(): LdapConnectionConfig | null {
  if (
    !process.env.LDAP_URL ||
    !process.env.LDAP_BIND_DN ||
    !process.env.LDAP_BIND_PASSWORD ||
    !process.env.LDAP_BASE_DN
  ) {
    return null;
  }

  const { host, port } = parseLdapUrl(process.env.LDAP_URL);

  return {
    name: process.env.LDAP_CONNECTION_NAME ?? "Creangel",
    host,
    port,
    bindDn: process.env.LDAP_BIND_DN,
    bindPassword: process.env.LDAP_BIND_PASSWORD,
    baseDn: process.env.LDAP_BASE_DN,
    userFilter: buildEnvUserFilter(),
    loginAttribute: process.env.LDAP_LOGIN_ATTRIBUTE ?? "sAMAccountName"
  };
}

export async function getActiveLdapConfig() {
  const savedConfig = await prisma.directoryConnection.findFirst({
    orderBy: { createdAt: "asc" }
  });

  if (savedConfig) {
    return {
      name: savedConfig.name,
      host: savedConfig.host,
      port: savedConfig.port,
      bindDn: savedConfig.bindDn,
      bindPassword: savedConfig.bindPassword,
      baseDn: savedConfig.baseDn,
      userFilter: savedConfig.userFilter,
      loginAttribute: savedConfig.loginAttribute,
      createdAt: savedConfig.createdAt
    } satisfies LdapConnectionConfig;
  }

  return getEnvLdapConfig();
}

function buildUserFilter(config: LdapConnectionConfig, username: string) {
  const escapedUsername = escapeLdapFilterValue(username);

  return `(&${config.userFilter}(|(${config.loginAttribute}=${escapedUsername})(userPrincipalName=${escapedUsername})(mail=${escapedUsername})))`;
}

function createClient(config: LdapConnectionConfig) {
  return new Client({
    url: `ldap://${config.host}:${config.port}`,
    timeout: 5000,
    connectTimeout: 5000
  });
}

export async function isLdapConfigured() {
  return Boolean(await getActiveLdapConfig());
}

export async function isLdapGroupRestricted() {
  const config = await getActiveLdapConfig();
  return Boolean(
    process.env.LDAP_REQUIRED_GROUP_DN?.trim() ||
      config?.userFilter.toLowerCase().includes("memberof")
  );
}

export async function authenticateWithLdap(
  username: string,
  password: string
): Promise<LdapUser | null> {
  const config = await getActiveLdapConfig();
  if (!config || !username || !password) return null;

  const client = createClient(config);

  try {
    await client.bind(config.bindDn, config.bindPassword);

    const result = await client.search(config.baseDn, {
      scope: "sub",
      sizeLimit: 1,
      filter: buildUserFilter(config, username),
      attributes: [
        "dn",
        config.loginAttribute,
        "cn",
        "displayName",
        "mail",
        "userPrincipalName"
      ]
    });

    const entry = result.searchEntries[0];
    const userDn = entry?.dn;

    if (!entry || !userDn) return null;

    await client.bind(userDn, password);

    const resolvedUsername =
      getStringAttribute(entry, config.loginAttribute) || username;
    const name =
      getStringAttribute(entry, "displayName") ||
      getStringAttribute(entry, "cn") ||
      resolvedUsername;
    const email =
      getStringAttribute(entry, "mail") ||
      getStringAttribute(entry, "userPrincipalName") ||
      `${resolvedUsername}@${config.baseDn
        .split(",")
        .filter((part) => part.toLowerCase().startsWith("dc="))
        .map((part) => part.slice(3))
        .join(".")}`;

    return {
      dn: userDn,
      username: resolvedUsername,
      name,
      email
    };
  } catch (error) {
    if (error instanceof InvalidCredentialsError) return null;
    throw error;
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

export async function listLdapUsers(
  configOverride?: LdapConnectionConfig
): Promise<LdapUser[]> {
  const config = configOverride ?? (await getActiveLdapConfig());
  if (!config) return [];

  const client = createClient(config);

  try {
    await client.bind(config.bindDn, config.bindPassword);

    const result = await client.search(config.baseDn, {
      scope: "sub",
      sizeLimit: 100,
      filter: config.userFilter,
      attributes: [
        "dn",
        config.loginAttribute,
        "cn",
        "displayName",
        "mail",
        "userPrincipalName"
      ]
    });

    return result.searchEntries
      .map((entry) => {
        const username = getStringAttribute(entry, config.loginAttribute);
        const name =
          getStringAttribute(entry, "displayName") ||
          getStringAttribute(entry, "cn") ||
          username;
        const email =
          getStringAttribute(entry, "mail") ||
          getStringAttribute(entry, "userPrincipalName") ||
          (username ? `${username}@newcreangel.local` : "");

        return {
          dn: entry.dn,
          username,
          name,
          email
        };
      })
      .filter((user) => user.dn && user.username && user.name && user.email);
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

export async function testLdapConnection(config: LdapConnectionConfig) {
  const users = await listLdapUsers(config);
  return {
    userCount: users.length
  };
}
