CREATE TABLE "DirectoryConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 389,
    "bindDn" TEXT NOT NULL,
    "bindPassword" TEXT NOT NULL,
    "baseDn" TEXT NOT NULL,
    "userFilter" TEXT NOT NULL DEFAULT '(objectClass=user)',
    "loginAttribute" TEXT NOT NULL DEFAULT 'sAMAccountName',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectoryConnection_pkey" PRIMARY KEY ("id")
);
