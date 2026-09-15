import * as React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button, Input, Label,
} from "@juddges/design-system";

export const SaveToCollection = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Save to collection</DialogTitle>
        <DialogDescription>
          Add II AKa 47/23 (Sąd Apelacyjny we Wrocławiu) to one of your research collections.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="collection-name">Collection name</Label>
        <Input id="collection-name" defaultValue="Aggravated theft — sentencing 2023" />
      </div>
      <DialogFooter>
        <Button variant="outline">Cancel</Button>
        <Button>Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const ConfirmDelete = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete conversation?</DialogTitle>
        <DialogDescription>
          &ldquo;Limitation periods in contract claims&rdquo; and its 14 messages will be removed permanently.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline">Keep</Button>
        <Button variant="destructive">Delete</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
