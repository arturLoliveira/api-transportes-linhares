/*
  Warnings:

  - Added the required column `senha` to the `clientes` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "senha" TEXT NOT NULL;
