import {
  query,
  tableValues,
  setValues,
  removeReadOnlyValues
} from "../helpers/mysql";
import { Email } from "../interfaces/tables/emails";
import { dateToDateTime } from "../helpers/utils";
import { KeyValue } from "../interfaces/general";
import { User } from "../interfaces/tables/user";
import { getUser } from "./user";
import { ErrorCode, Templates, CacheCategories } from "../interfaces/enum";
import { emailVerificationToken } from "../helpers/jwt";
import { mail } from "../helpers/mail";
import { InsertResult } from "../interfaces/mysql";
import { deleteItemFromCache, cachedQuery } from "../helpers/cache";

export const createEmail = async (email: Email, sendVerification = true) => {
  // Clean up values
  email.email = email.email.toLowerCase();
  email.isVerified = false;
  email.createdAt = new Date();
  email.updatedAt = email.createdAt;
  deleteItemFromCache(CacheCategories.USER_EMAILS, email.userId);
  const result = <InsertResult>(
    await query(
      `INSERT INTO emails ${tableValues(email)}`,
      Object.values(email)
    )
  );
  if (sendVerification) {
    await sendEmailVerification(
      result.insertId,
      email.email,
      await getUser(email.userId)
    );
  }
  return result;
};

export const sendEmailVerification = async (
  id: number,
  email: string,
  user: User
) => {
  const token = await emailVerificationToken(id);
  await mail(email, Templates.EMAIL_VERIFY, { name: user.name, email, token });
  return;
};

export const resendEmailVerification = async (id: number) => {
  const token = await emailVerificationToken(id);
  const emailObject = await getEmail(id);
  const email = emailObject.email;
  const user = await getUser(emailObject.userId);
  await mail(email, Templates.EMAIL_VERIFY, { name: user.name, email, token });
  return;
};

export const updateEmail = async (id: number, email: KeyValue) => {
  email.updatedAt = dateToDateTime(new Date());
  email = removeReadOnlyValues(email);
  const emailDetails = await getEmail(id);
  deleteItemFromCache(CacheCategories.EMAIL, emailDetails.email);
  deleteItemFromCache(CacheCategories.EMAIL, id);
  deleteItemFromCache(
    CacheCategories.USER_VERIFIED_EMAILS,
    emailDetails.userId
  );
  return await query(`UPDATE emails SET ${setValues(email)} WHERE id = ?`, [
    ...Object.values(email),
    id
  ]);
};

export const deleteEmail = async (id: number) => {
  const emailDetails = await getEmail(id);
  deleteItemFromCache(CacheCategories.EMAIL, emailDetails.email);
  deleteItemFromCache(CacheCategories.EMAIL, id);
  return await query("DELETE FROM emails WHERE id = ?", [id]);
};

export const getEmail = async (id: number) => {
  return (<Email[]>(
    await cachedQuery(
      CacheCategories.EMAIL,
      id,
      "SELECT * FROM emails WHERE id = ? LIMIT 1",
      [id]
    )
  ))[0];
};

export const getUserPrimaryEmailObject = async (user: User | number) => {
  let userObject: User;
  if (typeof user === "number") {
    userObject = await getUser(user);
  } else {
    userObject = user;
  }
  const primaryEmailId = userObject.primaryEmail;
  if (!primaryEmailId) throw new Error(ErrorCode.MISSING_PRIMARY_EMAIL);
  return await getEmail(primaryEmailId);
};

export const getUserPrimaryEmail = async (user: User | number) => {
  return (await getUserPrimaryEmailObject(user)).email;
};

export const getUserEmails = async (userId: number) => {
  return <Email>(
    await cachedQuery(
      CacheCategories.USER_EMAILS,
      userId,
      "SELECT * FROM emails WHERE userId = ?",
      [userId]
    )
  );
};

export const getEmailObject = async (email: string) => {
  return (<Email[]>(
    await cachedQuery(
      CacheCategories.EMAIL,
      email,
      "SELECT * FROM emails WHERE email = ? LIMIT 1",
      [email]
    )
  ))[0];
};

export const getUserVerifiedEmails = async (user: User | number) => {
  let userId = 0;
  if (typeof user === "object" && user.id) {
    userId = user.id;
  } else if (typeof user === "number") {
    userId = user;
  }
  if (!userId) throw new Error(ErrorCode.USER_NOT_FOUND);
  return <Email[]>(
    await cachedQuery(
      CacheCategories.USER_VERIFIED_EMAILS,
      userId,
      "SELECT * FROM emails WHERE userId = ? AND isVerified = 1",
      [userId]
    )
  );
};
