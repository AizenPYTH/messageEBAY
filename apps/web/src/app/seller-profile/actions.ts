"use server";

import {
  loadSellerProfileForm,
  saveSellerProfileForm,
  type SellerProfileFormDto,
} from "@/server/sellerProfile";

export async function getSellerProfileAction() {
  return loadSellerProfileForm();
}

export async function saveSellerProfileAction(
  form: Omit<SellerProfileFormDto, "sellerId">,
) {
  return saveSellerProfileForm(form);
}
