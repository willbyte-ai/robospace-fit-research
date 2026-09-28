# ABB IRB 1200-5/0.9 reference model

Original-generation IRB 1200, not IRB 1200 Gen2. Research checked 2026-09-22.

Official references:
- https://new.abb.com/products/robotics/nl/onze-robots/articulated-robots/irb-1200
- https://library.e.abb.com/public/b4a87b4973604837848d65132d1387af/IRB1200%20datasheet_20250224.pdf

The 2-page official datasheet was downloaded for local reference only; page 1 product photograph and page 2 physical dimensions, working-envelope illustration, and axis table were rendered with Poppler and visually inspected. The source is not copied into the public web asset folder.

Confirmed specifications: 6 axes, 5 kg rated payload, 0.9 m rated reach, 54 kg mass, 210 × 210 mm base. Joint positions and housing contours are an original approximate reconstruction from the product photograph and envelope illustration. The gripper is a generic original visualization accessory.

Axis limits in degrees: J1 [-170,170], J2 [-100,130], J3 [-200,70], J4 [-270,270], J5 [-130,130], J6 [-400,400]. Joint speed maxima in degrees/second: 288,240,297,400,405,600. These speed limits are specifications, not a guarantee of a trajectory's cycle time.

The metadata footprint diameter is 0.30 m, rounding up the circular bound of the 210 mm square mounting flange. It is not a manufacturer-specified circular base diameter.

Rig: Blender XY ground/Z up, meters, RIG_ROOT + six parented empties with identity world rotations in reference pose, joints tagged `joint_index` and `joint_axis`; TCP child of J6. Every application joint angle is interpreted as `(angle - homeDeg)` around the listed local reference axis. Pose [0,30,-30,0,90,0] is already modeled. Zeroing all six joints produces the conventional vertical upper arm, horizontal forearm, forward-facing flange.

Only the original robot collection is exported, using active-scene and selection filtering. Parts are batched per rigid link and material. Studio lights/floor/camera remain in the .blend but not the robot GLB. Existing Blender scenes are preserved.
